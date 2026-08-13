import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { parseGradeWorkbook } from "../app/lib/parser";

const input = process.argv[2];
if (!input) throw new Error("请提供验收工作簿路径");
const buffer = await readFile(input);

const asFile = (workbook: XLSX.WorkBook, name: string) => {
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new File([bytes], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
};

const parse = (workbook: XLSX.WorkBook, name: string) => parseGradeWorkbook(asFile(workbook, name));
const read = () => XLSX.read(buffer, { type: "buffer", cellDates: true });
const sheetRows = (workbook: XLSX.WorkBook, sheetName: string) => XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });
const writeRows = (workbook: XLSX.WorkBook, sheetName: string, rows: unknown[][]) => { workbook.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(rows); };

const baselineWorkbook = read();
const baseline = await parse(baselineWorkbook, "baseline.xlsx");
if (baseline.scores.length !== 7255 || baseline.exams.length !== 11 || baseline.thresholds.length !== 19 || baseline.itemResponses.length !== 16047) {
  throw new Error(`baseline mismatch: ${baseline.scores.length}/${baseline.exams.length}/${baseline.thresholds.length}/${baseline.itemResponses.length}`);
}

const compact = read();
const baseRows = sheetRows(compact, "学生基础");
const compactSeen = new Set<string>();
const compactStudents: unknown[][] = [];
const scoreSubjectColumns = [10, 13, 16, 19, 23, 27, 31, 35];
for (const row of baseRows.slice(33)) {
  if (!row[0] || !row[2] || !row[3]) continue;
  if (scoreSubjectColumns.filter((column) => typeof row[column] === "number" && Number.isFinite(row[column])).length < 4) continue;
  const key = `${row[0]}::${row[2]}::${row[3]}`;
  if (compactSeen.has(key)) continue;
  compactSeen.add(key);
  compactStudents.push(row);
  if (compactStudents.length === 900) break;
}
const scoreRows = baseRows.slice(0, 33).concat(compactStudents);
writeRows(compact, "学生基础", scoreRows);
for (const subject of ["语文", "数学", "英语", "物理", "化学", "生物", "政治", "地理", "历史"]) {
  const sheet = compact.SheetNames.find((name) => name === subject);
  if (!sheet) continue;
  const rows = sheetRows(compact, sheet);
  writeRows(compact, sheet, rows.slice(0, 4).concat(rows.slice(4).filter((row) => row[0] && row[1] && row[2]).slice(0, 30)));
}
const compactResult = await parse(compact, "compact.xlsx");
if (compactResult.scores.length !== 900 || compactResult.profile?.overallConfidence === undefined) throw new Error("compact fixture did not preserve score rows");
const cloneCompact = () => XLSX.read(XLSX.write(compact, { type: "buffer", bookType: "xlsx" }), { type: "buffer", cellDates: true });

const inserted = cloneCompact();
const insertedRows = sheetRows(inserted, "学生基础").map((row) => { const copy = [...row]; copy.splice(2, 0, null); return copy; });
writeRows(inserted, "学生基础", insertedRows);
const insertedResult = await parse(inserted, "inserted-column.xlsx");
if (insertedResult.scores.length !== compactResult.scores.length || insertedResult.profile?.fieldMatches.find((item) => item.field === "班级")?.column !== 3) throw new Error("inserted blank column was not normalized");

const renamed = cloneCompact();
renamed.SheetNames = renamed.SheetNames.map((name) => name === "学生基础" ? "成绩数据中心" : name);
renamed.Sheets["成绩数据中心"] = renamed.Sheets["学生基础"];
delete renamed.Sheets["学生基础"];
const renamedResult = await parse(renamed, "renamed-base-sheet.xlsx");
if (renamedResult.scores.length !== compactResult.scores.length) throw new Error("renamed base sheet was not discovered");

const missingSubject = cloneCompact();
const missingRows = sheetRows(missingSubject, "学生基础");
missingRows.forEach((row) => { if (row.length > 13) row.splice(13, 1); });
writeRows(missingSubject, "学生基础", missingRows);
const missingSubjectResult = await parse(missingSubject, "missing-subject.xlsx");
if (missingSubjectResult.scores.length !== compactResult.scores.length || (missingSubjectResult.profile?.subjectCompleteness ?? 1) >= (compactResult.profile?.subjectCompleteness ?? 1)) throw new Error("missing subject was not degraded gracefully");

const reconstructed = cloneCompact();
const reconstructedRows = sheetRows(reconstructed, "学生基础");
let reconstructedTargets = 0;
for (const row of reconstructedRows.slice(33)) {
  const numericSubjects = scoreSubjectColumns.filter((column) => typeof row[column] === "number" && Number.isFinite(row[column])).length;
  if (numericSubjects < 4 || row[5] === null || row[5] === undefined) continue;
  row[5] = null;
  reconstructedTargets += 1;
  if (reconstructedTargets === 20) break;
}
writeRows(reconstructed, "学生基础", reconstructedRows);
const reconstructedResult = await parse(reconstructed, "reconstructed-total.xlsx");
if ((reconstructedResult.profile?.reconstructedTotals ?? 0) < 20) throw new Error("missing totals were not reconstructed");

const missingItems = cloneCompact();
for (const subject of ["语文", "数学", "英语", "物理", "化学", "生物", "政治", "地理"]) {
  const index = missingItems.SheetNames.indexOf(subject);
  if (index >= 0) missingItems.SheetNames.splice(index, 1);
  delete missingItems.Sheets[subject];
}
const missingItemsResult = await parse(missingItems, "missing-items.xlsx");
if (missingItemsResult.itemResponses.length !== 0 || missingItemsResult.profile?.capabilities.find((item) => item.id === "items")?.available) throw new Error("missing item sheets did not degrade gracefully");

console.log(JSON.stringify({
  baseline: { scores: baseline.scores.length, exams: baseline.exams.length, thresholds: baseline.thresholds.length, itemResponses: baseline.itemResponses.length, confidence: Number((baseline.profile?.overallConfidence ?? 0).toFixed(3)) },
  compact: { scores: compactResult.scores.length, confidence: Number((compactResult.profile?.overallConfidence ?? 0).toFixed(3)) },
  insertedColumn: { scores: insertedResult.scores.length, classColumn: insertedResult.profile?.fieldMatches.find((item) => item.field === "班级")?.column },
  renamedBaseSheet: { scores: renamedResult.scores.length },
  missingSubject: { scores: missingSubjectResult.scores.length, subjectCompleteness: Number((missingSubjectResult.profile?.subjectCompleteness ?? 0).toFixed(3)) },
  reconstructedTotals: { count: reconstructedResult.profile?.reconstructedTotals ?? 0 },
  missingItems: { scores: missingItemsResult.scores.length, items: missingItemsResult.itemResponses.length, itemCapability: missingItemsResult.profile?.capabilities.find((item) => item.id === "items")?.available ?? false },
}));
