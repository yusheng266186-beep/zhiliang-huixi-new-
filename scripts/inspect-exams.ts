import { readFile } from "node:fs/promises";
import { parseGradeWorkbook } from "../app/lib/parser";

const input = process.argv[2];
if (!input) throw new Error("请提供工作簿路径");
const bytes = await readFile(input);
const dataset = await parseGradeWorkbook(new File([bytes], "检查考试.xlsx"));
const groups = Object.fromEntries(dataset.exams.map((exam) => {
  const rows = dataset.scores.filter((row) => row.exam === exam);
  return [exam, {
    count: rows.length,
    raw: [...new Set(rows.map((row) => row.rawExam))],
    sourceRows: [Math.min(...rows.map((row) => row.sourceRow ?? Infinity)), Math.max(...rows.map((row) => row.sourceRow ?? 0))],
    classes: [...new Set(rows.map((row) => row.classNo))],
    totalRange: [Math.min(...rows.map((row) => row.total)), Math.max(...rows.map((row) => row.total))],
  }];
}));
console.log(JSON.stringify({ exams: dataset.exams, groups, thresholds: dataset.thresholds.map((line) => ({ exam: line.exam, track: line.track, top: line.topTotal, undergraduate: line.undergraduateTotal })) }, null, 2));
