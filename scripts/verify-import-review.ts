import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { configureGradeImport, finalizeGradeImport, parseGradeWorkbook } from "../app/lib/parser";

const input = process.argv[2];
if (!input) throw new Error("请提供验收工作簿路径");
const bytes = await readFile(input);
const file = new File([bytes], "质量分析验收.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
const preview = await parseGradeWorkbook(file);

if (!preview.importReview) throw new Error("未生成导入确认摘要");
if (preview.importReview.detectedSchools.length !== 1) throw new Error(`学校识别异常：${preview.importReview.detectedSchools.length}`);
if (preview.importReview.identityCoverage !== 0) throw new Error("无学号工作簿被错误标记为已有学号");
const missingStudentIdIssue = preview.issues.find((issue) => issue.code === "missing-student-id");
if (!missingStudentIdIssue || missingStudentIdIssue.level !== "info") throw new Error("无学号被错误计为警告或错误");
if (!missingStudentIdIssue.message.includes("不参与数据质量评分")) throw new Error("无学号说明未明确评分口径");
if (preview.importReview.duplicateGroups !== 24 || preview.importReview.duplicateRows !== 24) throw new Error(`重复识别异常：${preview.importReview.duplicateGroups}/${preview.importReview.duplicateRows}`);
if (preview.scores.length !== 7255) throw new Error(`默认末行兼容结果异常：${preview.scores.length}`);

const keepFirst = configureGradeImport(preview, { school: preview.school, includeReconstructedTotals: true, duplicateStrategy: "keep-first" });
const keepAll = configureGradeImport(preview, { school: preview.school, includeReconstructedTotals: true, duplicateStrategy: "keep-all" });
const excludeReconstructed = configureGradeImport(preview, { school: preview.school, includeReconstructedTotals: false, duplicateStrategy: "keep-last" });
if (keepFirst.scores.length !== 7255) throw new Error(`保留首行数量异常：${keepFirst.scores.length}`);
if (keepAll.scores.length !== 7279) throw new Error(`全部保留数量异常：${keepAll.scores.length}`);
if (excludeReconstructed.scores.some((score) => score.totalSource === "reconstructed")) throw new Error("关闭重构总分后仍保留重构记录");

const finalized = finalizeGradeImport(preview);
if (finalized.importCandidates || finalized.importThresholds) throw new Error("确认后仍保留导入候选数据");

const idWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(idWorkbook, XLSX.utils.aoa_to_sheet([
  ["考试", "学校", "班级", "学号", "姓名", "总分", "语文", "数学", "英语", "物理", "化学", "生物"],
  ["测试物", "示例学校", 1, "A001", "同名学生", 500, 100, 90, 90, 70, 75, 75],
  ["测试物", "示例学校", 1, "A002", "同名学生", 510, 101, 91, 91, 71, 76, 76],
  ["测试物", "示例学校", 1, "A001", "同名学生", 505, 100, 90, 90, 70, 75, 80],
]), "学生基础");
const idBytes = XLSX.write(idWorkbook, { type: "buffer", bookType: "xlsx" });
const idResult = await parseGradeWorkbook(new File([idBytes], "id-fixture.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
if (idResult.scores.length !== 2 || idResult.importReview?.identityCoverage !== 1 || idResult.importReview.duplicateGroups !== 1) throw new Error("学号优先身份规则验证失败");
if (new Set(idResult.scores.map((score) => score.identityKey)).size !== 2) throw new Error("同名不同学号被错误合并");

console.log(JSON.stringify({
  defaultKeepLast: preview.scores.length,
  keepFirst: keepFirst.scores.length,
  keepAll: keepAll.scores.length,
  duplicateGroups: preview.importReview.duplicateGroups,
  conflictingGroups: preview.importReview.duplicateConflicts.filter((item) => item.conflictingFields.length > 0).length,
  idCoverage: preview.importReview.identityCoverage,
  reconstructedIncluded: preview.scores.filter((score) => score.totalSource === "reconstructed").length,
  reconstructedExcluded: excludeReconstructed.importReview?.excludedReconstructedRows ?? 0,
  stableIdFixture: { scores: idResult.scores.length, duplicateGroups: idResult.importReview?.duplicateGroups, identityCoverage: idResult.importReview?.identityCoverage },
}));
