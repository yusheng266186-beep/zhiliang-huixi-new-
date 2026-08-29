// 从一份真实工作簿生成可提交的合成示例工作簿 examples/synthetic-quality-review.xlsx：
//  1. 所有学生姓名替换为 学生001/学生002…（全工作簿字符串统一替换，长名优先）；
//  2. 分数类数值做 ±8% 的确定性扰动（同一单元格永远得到同一结果，可复现）；
//     学号/班级/排名/题号/满分等关键列以及日期、年份不扰动，结构与行数完全保留。
// 用法：node --import tsx scripts/make-fixture.ts <真实工作簿.xlsx>
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { parseGradeWorkbook } from "../app/lib/parser";

const FIXTURE = "examples/synthetic-quality-review.xlsx";
const input = process.argv[2];
if (!input) {
  console.error("用法：node --import tsx scripts/make-fixture.ts <真实工作簿.xlsx>");
  process.exit(1);
}
if (!existsSync("examples")) {
  console.error("请先创建 examples/ 目录。");
  process.exit(1);
}

console.log("解析真实工作簿以提取姓名清单…");
const sourceBytes = readFileSync(input);
const sourceDataset = await parseGradeWorkbook(new File([sourceBytes], "source.xlsx"));
const names = [...new Set(sourceDataset.scores.map((score) => score.name).filter(Boolean))].sort((a, b) => b.length - a.length);
if (!names.length) {
  console.error("未解析到任何学生姓名，请确认这是有效的质量复盘工作簿。");
  process.exit(1);
}
console.log(`识别到 ${names.length} 个姓名，开始替换与扰动…`);
// 数字型考试名（如 41/43）不能被当作分数扰动，否则小题表头块与数据行失去对应关系
const examNameTexts = new Set(sourceDataset.exams.map((exam) => String(exam)));

const workbook = XLSX.read(sourceBytes, { type: "buffer", cellDates: true });
const replacements = new Map(names.map((name, index) => [name, `学生${String(index + 1).padStart(3, "0")}`]));

// 长名优先替换，避免“李明”抢先匹配“李明明”
const replaceNames = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  let result = value;
  for (const [name, alias] of replacements) {
    if (result.includes(name)) result = result.split(name).join(alias);
  }
  return result;
};

const KEEP_COLUMN = /学号|考号|班级|排名|位次|年份|日期|题号|满分|序号|编号|学校|考试|科目|姓名|知识点|等级|组名/;
const hash32 = (text: string) => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const jitter = (value: number, seed: string) => {
  const factor = 0.92 + (hash32(seed) % 1000) / 1000 * 0.16;
  return Math.max(0, Math.round(value * factor * 10) / 10);
};

let replacedCells = 0, jitteredCells = 0;
for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet["!ref"]) continue;
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const keepColumns = new Set<number>();
  for (let row = range.s.r; row <= Math.min(range.e.r, range.s.r + 7); row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell && typeof cell.v === "string" && KEEP_COLUMN.test(cell.v)) keepColumns.add(column);
    }
  }
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = sheet[address];
      if (!cell) continue;
      if (typeof cell.v === "string") {
        const replaced = replaceNames(cell.v);
        if (replaced !== cell.v) { cell.v = replaced; replacedCells += 1; }
        continue;
      }
      // 第 0 列是考试名列（可能以数字命名，如 41/43），扰动会破坏表头块与数据行的对应关系。
      if (column === range.s.c) continue;
      if (cell.t !== "n" || typeof cell.v !== "number" || !Number.isFinite(cell.v)) continue;
      if (examNameTexts.has(String(cell.v))) continue;
      if (keepColumns.has(column) || cell.v <= 0 || cell.v > 750 || (Number.isInteger(cell.v) && cell.v >= 1000)) continue;
      // 1~16 的整数视为班级号，不扰动。
      if (Number.isInteger(cell.v) && cell.v >= 1 && cell.v <= 16) continue;
      const next = jitter(cell.v, `${sheetName}:${row}:${column}`);
      if (next !== cell.v) { cell.v = next; cell.f = undefined; jitteredCells += 1; }
    }
  }
}
workbook.Props = { Title: "synthetic quality review fixture", Author: "grade-quality-insight" };

const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
writeFileSync(FIXTURE, bytes);
console.log(`已写入 ${FIXTURE}（替换 ${replacedCells} 个姓名单元格，扰动 ${jitteredCells} 个分数单元格）。`);
console.log("注意：该文件已被 .gitignore 排除，仅保存在本机用于离线验证，请勿提交（体积约几十 MB）。");

// 自检：重新解析合成工作簿，确认姓名已全部替换、结构保留
const check = await parseGradeWorkbook(new File([bytes], "fixture.xlsx"));
const leaked = check.scores.map((score) => score.name).filter((name) => !/^学生\d{3}$/.test(name));
if (leaked.length) {
  console.error(`自检失败：仍有 ${new Set(leaked).size} 个未替换姓名，请勿提交该文件！`);
  process.exit(1);
}
console.log(`自检通过：scores=${check.scores.length}, exams=${check.exams.length}, thresholds=${check.thresholds.length}, itemResponses=${check.itemResponses.length}，姓名全部为合成代号。`);
