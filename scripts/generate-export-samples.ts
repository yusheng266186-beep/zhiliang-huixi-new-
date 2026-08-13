import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseGradeWorkbook } from "../app/lib/parser";
import { buildQualityReport } from "../app/lib/report-model";
import { buildReportWordBlob, buildStyledAnalysisExcelBytes } from "../app/lib/exporters";

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error("用法：generate-export-samples <工作簿> <输出目录>");

const bytes = await readFile(input);
const dataset = await parseGradeWorkbook(new File([bytes], "质量分析验收.xlsx"));
const exam = dataset.exams.includes("4册") ? "4册" : dataset.exams.at(-1)!;
const report = buildQualityReport(dataset, { exam, track: "物理类", classNo: "全部", reportType: "年级质量分析", subject: "化学" });
const chart = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAA+gAAAGQCAYAAAA9TUphAAAAKUlEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAfg0woAABjoII5QAAAABJRU5ErkJggg==";

await mkdir(output, { recursive: true });
const word = await buildReportWordBlob(report, { overview: chart, detail: chart });
const excel = await buildStyledAnalysisExcelBytes(report);
const wordPath = join(output, "质量慧析-4册-年级质量分析-验收.docx");
const excelPath = join(output, "质量慧析-4册-年级质量分析-验收.xlsx");
await writeFile(wordPath, new Uint8Array(await word.arrayBuffer()));
await writeFile(excelPath, excel);
console.log(JSON.stringify({ wordPath, wordBytes: word.size, excelPath, excelBytes: excel.byteLength, students: report.students.length, critical: report.critical.length }));
