import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { parseGradeWorkbook } from "../app/lib/parser";
import { buildQualityReport } from "../app/lib/report-model";
import { buildAnalysisWorkbook, buildReportWordBlob, buildStyledAnalysisExcelBytes } from "../app/lib/exporters";

const input = process.argv[2];
if (!input) throw new Error("请提供验收工作簿路径");
const bytes = await readFile(input);
const dataset = await parseGradeWorkbook(new File([bytes], "export-verification.xlsx"));
const exam = dataset.exams.includes("4册") ? "4册" : dataset.exams.at(-1)!;
const report = buildQualityReport(dataset, { exam, track: "物理类", classNo: "全部", reportType: "年级质量分析", subject: "化学" });
const datasetWithIds = { ...dataset, scores: dataset.scores.map((score, index) => ({ ...score, studentId: score.studentId ?? `QA-${index + 1}` })), importReview: dataset.importReview ? { ...dataset.importReview, idRows: dataset.scores.length, identityCoverage: 1 } : undefined };
const reportWithIds = buildQualityReport(datasetWithIds, { exam, track: "物理类", classNo: "全部", reportType: "年级质量分析", subject: "化学" });
if (reportWithIds.quality.score !== report.quality.score) throw new Error(`学号覆盖率错误影响质量评分：${report.quality.score}/${reportWithIds.quality.score}`);

const book = await buildAnalysisWorkbook(report);
const expectedSheets = ["分析摘要", "可视化摘要", "学生明细", "成绩分布", "学生分层", "班级对标", "学科诊断", "临界生清单", "化学知识点", "历次趋势", "分数线", "字段映射", "数据质检"];
if (JSON.stringify(book.SheetNames) !== JSON.stringify(expectedSheets)) throw new Error(`Excel工作表不完整：${book.SheetNames.join("、")}`);
const studentRows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets["学生明细"]!, { header: 1 });
if (studentRows.length - 1 !== report.students.length) throw new Error(`学生明细行数错误：${studentRows.length - 1}/${report.students.length}`);
const distributionRows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets["成绩分布"]!, { header: 1 });
const distributionCount = distributionRows.slice(1).reduce((sum, row) => sum + Number(row[1] ?? 0), 0);
if (distributionCount !== report.summary.count) throw new Error(`成绩分布人数不守恒：${distributionCount}/${report.summary.count}`);
const segmentRows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets["学生分层"]!, { header: 1 });
const segmentCount = segmentRows.slice(1).reduce((sum, row) => sum + Number(row[1] ?? 0), 0);
if (segmentCount !== report.summary.count) throw new Error(`学生分层人数不守恒：${segmentCount}/${report.summary.count}`);
if (report.critical.length && XLSX.utils.sheet_to_json<unknown[]>(book.Sheets["临界生清单"]!, { header: 1 }).length - 1 !== report.critical.length) throw new Error("临界生清单不完整");

const workbookBytes = XLSX.write(book, { bookType: "xlsx", type: "array" });
const reopened = XLSX.read(workbookBytes, { type: "array" });
if (reopened.SheetNames.length !== expectedSheets.length) throw new Error("Excel重新打开后工作表数量变化");
const styledWorkbookBytes = await buildStyledAnalysisExcelBytes(report);
const styledReopened = XLSX.read(styledWorkbookBytes, { type: "array" });
if (JSON.stringify(styledReopened.SheetNames) !== JSON.stringify(expectedSheets)) throw new Error("带样式Excel重新打开后工作表不完整");
const styledStudentRows = XLSX.utils.sheet_to_json<unknown[]>(styledReopened.Sheets["学生明细"]!, { header: 1 });
if (styledStudentRows.length - 1 !== report.students.length) throw new Error("带样式Excel学生明细不完整");
const qualityRows = XLSX.utils.sheet_to_json<unknown[]>(styledReopened.Sheets["数据质检"]!, { header: 1 });
if (!qualityRows.some((row) => row[0] === "身份关联方式" && String(row[1]).includes("不参与评分"))) throw new Error("Excel质检页未说明学号为可选字段");
if (qualityRows.some((row) => row[0] === "学号身份覆盖")) throw new Error("Excel仍将学号覆盖率作为质量指标");
const mappingRows = XLSX.utils.sheet_to_json<unknown[]>(styledReopened.Sheets["字段映射"]!, { header: 1 });
if (!mappingRows.some((row) => row[0] === "学号" && row[1] === "可选未提供" && row[4] === "不计分")) throw new Error("Excel字段映射仍把缺失学号显示为质量缺陷");

const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/lzQJ5AAAAABJRU5ErkJggg==";
const wordBlob = await buildReportWordBlob(report, { overview: pixel, detail: pixel });
if (wordBlob.size < 18_000) throw new Error(`Word文件异常偏小：${wordBlob.size}`);
const wordBytes = new Uint8Array(await wordBlob.arrayBuffer());
if (wordBytes[0] !== 0x50 || wordBytes[1] !== 0x4b) throw new Error("Word不是有效的OpenXML压缩包");
const JSZip = (await import("jszip")).default;
const wordArchive = await JSZip.loadAsync(wordBytes);
const documentXml = await wordArchive.file("word/document.xml")!.async("string");
const wordText = documentXml.replace(/<w:tab\/?\s*>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "");
if (/\d+\.\d{5,}/.test(wordText)) throw new Error("Word报告出现未格式化的浮点精度长串");
if (!wordText.includes("图例｜紫色柱") || !wordText.includes("琥珀色柱 = 一本/特控上线率")) throw new Error("Word图表缺少清晰图例");
if (!wordText.includes("身份关联方式") || wordText.includes("学号身份覆盖")) throw new Error("Word仍将学号覆盖率作为质量指标");

console.log(JSON.stringify({
  report: { exam, students: report.students.length, distribution: distributionCount, segments: segmentCount, classes: report.classes.length, subjects: report.subjects.length, critical: report.critical.length, knowledge: report.knowledge.length, trends: report.trend.length },
  excel: { sheets: book.SheetNames.length, studentRows: studentRows.length - 1, bytes: workbookBytes.byteLength, styledBytes: styledWorkbookBytes.byteLength },
  word: { bytes: wordBlob.size, charts: 2, criticalRows: report.critical.length, knowledgeRows: report.knowledge.length },
}));
