import * as XLSX from "xlsx";
import { CLASS_PROFILES, getClassProfile, normalizeExam, relevantSubjects } from "./class-config";
import type { DataCapability, DataProfile, DuplicateConflict, DuplicateStrategy, FieldMatch, GradeDataset, GradeImportOptions, ImportIssue, ImportReview, ItemResponse, QuestionMeta, StudentScore, SubjectName, Threshold, Track } from "./types";

type Row = unknown[];
type ColumnMap = { exam: number | null; school: number | null; classNo: number | null; studentId: number | null; name: number | null; total: number | null; cityRank: number | null; schoolRank: number | null; subjects: Partial<Record<SubjectName, number>> };
const SUBJECTS: SubjectName[] = ["语文", "数学", "英语", "日语", "物理", "历史", "化学", "生物", "政治", "地理"];
const CORE_SUBJECTS: SubjectName[] = ["语文", "数学", "英语"];
const MAX_ITEM_COLUMNS = 180;
const text = (value: unknown): string => String(value ?? "").trim();
const normalized = (value: unknown): string => text(value).replace(/[\s\r\n　:：_\-—·（）()]/g, "").toLowerCase();
const num = (value: unknown): number | null => { if (typeof value === "number" && Number.isFinite(value)) return value; const source = text(value).replace(/,/g, ""); if (!source) return null; const parsed = Number(source); return Number.isFinite(parsed) ? parsed : null; };
const scoreOr = (...values: unknown[]): number | undefined => { for (const value of values) { const parsed = num(value); if (parsed !== null) return parsed; } return undefined; };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const uniq = <T,>(values: T[]): T[] => [...new Set(values)];
const identityPart = (value: unknown): string => text(value).replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
const identityKey = (score: Pick<StudentScore, "school" | "classNo" | "name" | "studentId">): string => score.studentId ? `id::${identityPart(score.school)}::${identityPart(score.studentId)}` : `name::${identityPart(score.school)}::${score.classNo}::${identityPart(score.name)}`;
const trackFromExam = (rawExam: string, classNo?: number): Track => /历(史|类)?/.test(rawExam) ? "历史类" : /物(理|类)?/.test(rawExam) ? "物理类" : classNo ? getClassProfile(classNo, rawExam).track : "未配置";
const subjectOrder = (track: Track): SubjectName[] => track === "历史类" ? ["语文", "数学", "英语", "历史", "政治", "地理"] : ["语文", "数学", "英语", "物理", "化学", "生物"];
const columnCount = (rows: Row[]) => Math.min(240, Math.max(0, ...rows.slice(0, 120).map((row) => row.length)));
const joinedHeader = (rows: Row[], rowIndexes: number[], column: number) => uniq(rowIndexes.map((row) => text(rows[row]?.[column])).filter(Boolean)).join(" / ");

const findScoreHeader = (rows: Row[]) => {
  let best: { row: number; score: number } | null = null;
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 120); rowIndex += 1) {
    const window = rows.slice(Math.max(0, rowIndex - 3), rowIndex + 1).flat().map(normalized);
    const score = Number(window.includes("考试")) * 3 + Number(window.some((v) => v.includes("班级"))) * 2 + Number(window.some((v) => v === "姓名" || v.includes("学生姓名"))) * 2 + Number(window.some((v) => v.includes("总分"))) * 2 + Number(window.some((v) => SUBJECTS.some((s) => v.includes(s))));
    if (!best || score > best.score) best = { row: rowIndex, score };
  }
  return best && best.score >= 7 ? best.row : null;
};

const chooseColumn = (headers: string[], include: string[], options?: { exclude?: string[]; prefer?: string[]; fallback?: number | null }) => {
  const matches = headers.map((header, column) => ({ header, normalized: normalized(header), column })).filter((item) => include.some((token) => item.normalized.includes(normalized(token)))).filter((item) => !(options?.exclude ?? []).some((token) => item.normalized.includes(normalized(token))));
  matches.sort((a, b) => { const preference = (value: string) => (options?.prefer ?? []).reduce((sum, token, index) => sum + (value.includes(normalized(token)) ? (options!.prefer!.length - index) * 10 : 0), 0); return preference(b.normalized) - preference(a.normalized) || a.column - b.column; });
  if (matches[0]) return { column: matches[0].column, header: matches[0].header, strategy: "semantic" as const, confidence: .98 };
  const fallback = options?.fallback ?? null, fallbackHeader = fallback === null ? "" : headers[fallback] ?? "";
  const conflict = (options?.exclude ?? []).some((token) => normalized(fallbackHeader).includes(normalized(token)));
  return fallback === null || conflict ? { column: null, header: "", strategy: "missing" as const, confidence: 0 } : { column: fallback, header: fallbackHeader, strategy: "fallback" as const, confidence: .48 };
};

const mapScoreColumns = (rows: Row[], headerRow: number) => {
  const headerRows = Array.from({ length: 4 }, (_, index) => headerRow - 3 + index).filter((row) => row >= 0), headers = Array.from({ length: columnCount(rows) }, (_, column) => joinedHeader(rows, headerRows, column));
  const exam = chooseColumn(headers, ["考试", "考试名称", "场次"], { fallback: 0 });
  const school = chooseColumn(headers, ["学校", "校名"], { exclude: ["排名", "市名", "校名次"], fallback: 1 });
  const classNo = chooseColumn(headers, ["班级", "行政班"], { fallback: 2 });
  const studentId = chooseColumn(headers, ["学号", "学生编号", "学生号", "考生号", "准考证号"], { exclude: ["排名", "名次"] });
  const name = chooseColumn(headers, ["姓名", "学生姓名"], { fallback: 3 });
  const total = chooseColumn(headers, ["总分", "总成绩"], { exclude: ["排名", "名次", "市名", "校名"], prefer: ["赋分", "成绩", "原分"], fallback: 5 });
  const cityRank = chooseColumn(headers, ["市赋名", "市排名", "市名次", "全市排名", "市原名"], { prefer: ["市赋名", "市排名", "市名次"], fallback: 7 });
  const schoolRank = chooseColumn(headers, ["校赋名", "校排名", "校名次", "校原名"], { prefer: ["校赋名", "校排名", "校名次"], fallback: 9 });
  const subjectMatches: Partial<Record<SubjectName, ReturnType<typeof chooseColumn>>> = {};
  SUBJECTS.forEach((subject) => { const preferred = CORE_SUBJECTS.includes(subject) || subject === "日语" ? ["原分", "成绩"] : ["赋分", "成绩", "原分"]; const fallback: Partial<Record<SubjectName, number>> = { 语文: 10, 数学: 13, 英语: 16, 日语: 16, 物理: 19, 历史: 19, 政治: 23, 地理: 27, 化学: 31, 生物: 35 }; subjectMatches[subject] = chooseColumn(headers, [subject], { exclude: ["排名", "名次", "市名", "校名", "赋名"], prefer: preferred, fallback: fallback[subject] ?? null }); });
  const fieldMatches: FieldMatch[] = [{ field: "考试", ...exam }, { field: "学校", ...school }, { field: "班级", ...classNo }, { field: "学号", ...studentId }, { field: "姓名", ...name }, { field: "总分", ...total }, { field: "市排名", ...cityRank }, { field: "校排名", ...schoolRank }, ...SUBJECTS.map((subject): FieldMatch => ({ field: subject, ...subjectMatches[subject]! }))];
  const columns: ColumnMap = { exam: exam.column, school: school.column, classNo: classNo.column, studentId: studentId.column, name: name.column, total: total.column, cityRank: cityRank.column, schoolRank: schoolRank.column, subjects: Object.fromEntries(SUBJECTS.map((subject) => [subject, subjectMatches[subject]?.column]).filter((entry) => typeof entry[1] === "number")) };
  return { columns, fieldMatches };
};

const parseThresholds = (rows: Row[], issues: ImportIssue[]) => {
  const map = new Map<string, Threshold>(), anchors: Array<{ tier: "top" | "undergraduate"; column: number; strategy: "semantic" | "fallback" }> = [], width = columnCount(rows.slice(0, 12));
  for (let column = 0; column < width; column += 1) { const header = normalized(joinedHeader(rows, [0, 1, 2, 3], column)); if ((header.includes("一本") || header.includes("特控")) && !anchors.some((item) => item.tier === "top")) anchors.push({ tier: "top", column, strategy: "semantic" }); if (header.includes("本科") && !anchors.some((item) => item.tier === "undergraduate")) anchors.push({ tier: "undergraduate", column, strategy: "semantic" }); }
  if (!anchors.some((item) => item.tier === "top")) anchors.push({ tier: "top", column: 1, strategy: "fallback" });
  if (!anchors.some((item) => item.tier === "undergraduate")) anchors.push({ tier: "undergraduate", column: 10, strategy: "fallback" });
  const ensure = (rawExam: string) => { const track = trackFromExam(rawExam), exam = normalizeExam(rawExam), key = `${exam}::${track}`; if (!map.has(key)) map.set(key, { exam, track, topTotal: null, undergraduateTotal: null, topSubjects: {}, undergraduateSubjects: {} }); return map.get(key)!; };
  const layouts = [...anchors].sort((a, b) => a.column - b.column).map((anchor, index, sorted) => { const blockEnd = sorted[index + 1]?.column ?? width, totalColumn = Array.from({ length: Math.max(0, blockEnd - anchor.column - 1) }, (_, offset) => anchor.column + 1 + offset).find((column) => normalized(joinedHeader(rows, [0, 1, 2, 3], column)).includes("总分")) ?? anchor.column + 1; return { ...anchor, blockEnd, totalColumn }; });
  rows.slice(0, Math.min(rows.length, 80)).forEach((row) => layouts.forEach(({ tier, column, totalColumn, blockEnd }) => { const rawExam = text(row[column]), total = num(row[totalColumn]); if (!rawExam || total === null || rawExam.length > 30 || !/[\d一二三四五六七八九十入月半自成绵金零诊期末期中]/.test(rawExam)) return; const threshold = ensure(rawExam); if (tier === "top") threshold.topTotal = total; else threshold.undergraduateTotal = total; subjectOrder(threshold.track).forEach((subject) => { const subjectColumn = Array.from({ length: Math.max(0, blockEnd - totalColumn - 1) }, (_, offset) => totalColumn + 1 + offset).find((candidate) => [0, 1, 2, 3].some((headerRow) => normalized(rows[headerRow]?.[candidate]) === normalized(subject))); const value = subjectColumn === undefined ? null : num(row[subjectColumn]); if (value === null) return; if (tier === "top") threshold.topSubjects[subject] = value; else threshold.undergraduateSubjects[subject] = value; }); }));
  map.forEach((threshold) => { if (threshold.topSubjects.英语 !== undefined) threshold.topSubjects.日语 = threshold.topSubjects.英语; if (threshold.undergraduateSubjects.英语 !== undefined) threshold.undergraduateSubjects.日语 = threshold.undergraduateSubjects.英语; if (threshold.track === "物理类" && threshold.topSubjects.生物 !== undefined) threshold.topSubjects.地理 = threshold.topSubjects.生物; if (threshold.track === "物理类" && threshold.undergraduateSubjects.生物 !== undefined) threshold.undergraduateSubjects.地理 = threshold.undergraduateSubjects.生物; });
  if (anchors.some((item) => item.strategy === "fallback")) issues.push({ level: "info", module: "分数线", message: "部分分数线区块使用相对位置识别；保留“一本/特控、本科”标题可获得最高置信度。" });
  return [...map.values()];
};

const parseScores = (rows: Row[], issues: ImportIssue[], classProfiles = CLASS_PROFILES) => {
  const headerRow = findScoreHeader(rows); if (headerRow === null) return { scores: [] as StudentScore[], fieldMatches: [] as FieldMatch[], headerRow: null, reconstructedTotals: 0, skippedRows: 0 };
  const { columns, fieldMatches } = mapScoreColumns(rows, headerRow), rawScores: StudentScore[] = [], schoolCounts = new Map<string, number>();
  const incompleteRowNumbers: number[] = [], missingTotalRowNumbers: number[] = [], outOfRangeRowNumbers: number[] = [];
  let reconstructedTotals = 0;
  for (let index = headerRow + 1; index < rows.length; index += 1) {
    const row = rows[index], rawExam = columns.exam === null ? "" : text(row[columns.exam]), classValue = columns.classNo === null ? null : num(row[columns.classNo]), name = columns.name === null ? "" : text(row[columns.name]), school = columns.school === null ? "" : text(row[columns.school]);
    const sourceRow = index + 1, hasIdentityFragment = Boolean(rawExam || name || classValue !== null); if (!rawExam || classValue === null || !name) { if (hasIdentityFragment) incompleteRowNumbers.push(sourceRow); continue; }
    const classNo = Math.trunc(classValue), profile = getClassProfile(classNo, rawExam, classProfiles), subjects: StudentScore["subjects"] = {};
    relevantSubjects(profile).forEach((subject) => { const sourceSubject: SubjectName = profile.subjectSourceOverrides?.[subject] ?? subject; const column = columns.subjects[sourceSubject] ?? columns.subjects[subject]; if (typeof column !== "number") return; const score = num(row[column]); if (score !== null) subjects[subject] = score; });
    let total = columns.total === null ? undefined : scoreOr(row[columns.total]), totalSource: StudentScore["totalSource"] = "source";
    if (total === undefined) { const values = Object.values(subjects).filter((value): value is number => typeof value === "number"); if (values.length >= 4) { total = values.reduce((sum, value) => sum + value, 0); totalSource = "reconstructed"; reconstructedTotals += 1; } else { missingTotalRowNumbers.push(sourceRow); continue; } }
    if (total < 0 || total > 750) outOfRangeRowNumbers.push(sourceRow);
    const resolvedSchool = school || "未标注学校";
    const studentId = columns.studentId === null ? null : text(row[columns.studentId]) || null;
    const score: StudentScore = { exam: normalizeExam(rawExam), rawExam, school: resolvedSchool, classNo, studentId, name, sourceRow, track: profile.track, classType: profile.type, combination: profile.combination, total, totalSource, cityRank: columns.cityRank === null ? null : num(row[columns.cityRank]), schoolRank: columns.schoolRank === null ? null : num(row[columns.schoolRank]), subjects };
    score.identityKey = identityKey(score);
    rawScores.push(score);
    schoolCounts.set(resolvedSchool, (schoolCounts.get(resolvedSchool) ?? 0) + 1);
  }
  if (incompleteRowNumbers.length) issues.push({ level: "warning", module: "成绩", code: "missing-identity", affectedCount: incompleteRowNumbers.length, rowNumbers: incompleteRowNumbers.slice(0, 20), message: `${incompleteRowNumbers.length}行缺少考试、班级或姓名，已跳过，不影响其他有效数据。`, suggestion: "补齐缺失身份字段后可恢复这些记录。" });
  if (missingTotalRowNumbers.length) issues.push({ level: "warning", module: "成绩", code: "missing-total", affectedCount: missingTotalRowNumbers.length, rowNumbers: missingTotalRowNumbers.slice(0, 20), message: `${missingTotalRowNumbers.length}行既无总分又不足4门有效学科，已跳过。`, suggestion: "补充总分或至少4门学科成绩。" });
  if (reconstructedTotals) issues.push({ level: "info", module: "成绩", code: "reconstructed-total", affectedCount: reconstructedTotals, message: `${reconstructedTotals}条缺失总分可由至少4门有效学科重构；是否纳入由本次导入设置决定。` });
  if (outOfRangeRowNumbers.length) issues.push({ level: "warning", module: "成绩", code: "out-of-range", affectedCount: outOfRangeRowNumbers.length, rowNumbers: outOfRangeRowNumbers.slice(0, 20), message: `发现${outOfRangeRowNumbers.length}条总分超出0—750常规范围，已保留并标注。` });
  return { scores: rawScores, fieldMatches, headerRow, reconstructedTotals, skippedRows: incompleteRowNumbers.length + missingTotalRowNumbers.length };
};

const scoreFieldValue = (score: StudentScore, field: string): unknown => {
  if (field === "总分") return score.total;
  if (field === "市排名") return score.cityRank;
  if (field === "校排名") return score.schoolRank;
  return score.subjects[field as SubjectName];
};

const applyImportOptions = (candidates: StudentScore[], issues: ImportIssue[], options: GradeImportOptions) => {
  const duplicateStrategy: DuplicateStrategy = options.duplicateStrategy ?? "keep-last";
  const includeReconstructedTotals = options.includeReconstructedTotals ?? true;
  const schoolCounts = new Map<string, number>();
  candidates.forEach((score) => schoolCounts.set(score.school, (schoolCounts.get(score.school) ?? 0) + 1));
  const detectedSchools = [...schoolCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN")).map(([school, rowCount]) => ({ school, rowCount, studentCount: new Set(candidates.filter((score) => score.school === school).map((score) => score.identityKey ?? identityKey(score))).size }));
  const preferredSchool = detectedSchools[0]?.school ?? "未识别学校";
  const selectedSchool = options.school === undefined ? preferredSchool : options.school;
  const schoolScores = selectedSchool === null ? candidates : candidates.filter((score) => score.school === selectedSchool);
  const eligibleScores = includeReconstructedTotals ? schoolScores : schoolScores.filter((score) => score.totalSource !== "reconstructed");
  const duplicateBuckets = new Map<string, StudentScore[]>();
  eligibleScores.forEach((score) => { const key = `${score.exam}::${score.identityKey ?? identityKey(score)}`; duplicateBuckets.set(key, [...(duplicateBuckets.get(key) ?? []), score]); });
  const duplicateGroups = [...duplicateBuckets.values()].filter((group) => group.length > 1);
  const duplicateRows = duplicateGroups.reduce((sum, group) => sum + group.length - 1, 0);
  const scores = duplicateStrategy === "keep-all" ? eligibleScores : [...duplicateBuckets.values()].map((group) => duplicateStrategy === "keep-first" ? group[0]! : group.at(-1)!);
  const comparableFields = ["总分", "市排名", "校排名", ...SUBJECTS];
  const duplicateConflicts: DuplicateConflict[] = duplicateGroups.map((group) => ({ exam: group[0]!.exam, classNo: group[0]!.classNo, rowNumbers: group.map((score) => score.sourceRow ?? 0).filter(Boolean), conflictingFields: comparableFields.filter((field) => new Set(group.map((score) => String(scoreFieldValue(score, field) ?? ""))).size > 1) }));
  const sameNameBuckets = new Map<string, StudentScore[]>();
  eligibleScores.forEach((score) => { const key = `${score.exam}::${identityPart(score.school)}::${identityPart(score.name)}`; sameNameBuckets.set(key, [...(sameNameBuckets.get(key) ?? []), score]); });
  const sameNameGroups = [...sameNameBuckets.values()].filter((group) => new Set(group.map((score) => score.identityKey ?? identityKey(score))).size > 1);
  const idRows = scores.filter((score) => score.studentId).length;
  const review: ImportReview = { candidateRows: candidates.length, retainedRows: scores.length, detectedSchools, selectedSchool, studentCount: new Set(scores.map((score) => score.identityKey ?? identityKey(score))).size, classCount: new Set(scores.map((score) => `${score.school}::${score.classNo}`)).size, idRows, identityCoverage: scores.length ? idRows / scores.length : 0, duplicateGroups: duplicateGroups.length, duplicateRows, duplicateConflicts, sameNameGroups: sameNameGroups.length, reconstructedTotals: schoolScores.filter((score) => score.totalSource === "reconstructed").length, skippedRows: 0, excludedSchoolRows: candidates.length - schoolScores.length, excludedReconstructedRows: schoolScores.length - eligibleScores.length, deduplicatedRows: duplicateStrategy === "keep-all" ? 0 : duplicateRows };
  if (!idRows) issues.push({ level: "info", module: "成绩", code: "missing-student-id", affectedCount: scores.length, message: "本表未提供学号，学生身份已按学校＋班级＋姓名关联；学号为可选字段，不参与数据质量评分。", suggestion: "如后续提供学号、考生号或准考证号，系统会自动优先使用稳定编号。" });
  if (detectedSchools.length > 1) issues.push({ level: "warning", module: "成绩", code: "multiple-schools", affectedCount: detectedSchools.length, message: `识别到${detectedSchools.length}所学校，当前${selectedSchool === null ? "保留全部学校" : `选择“${selectedSchool}”`}。`, suggestion: "请在导入确认中核对学校范围。" });
  if (duplicateRows) issues.push({ level: "warning", module: "成绩", code: "duplicate-record", affectedCount: duplicateRows, rowNumbers: duplicateGroups.flatMap((group) => group.map((score) => score.sourceRow ?? 0)).filter(Boolean).slice(0, 40), message: `发现${duplicateGroups.length}组重复身份成绩（多出${duplicateRows}行），当前策略为${duplicateStrategy === "keep-all" ? "全部保留" : duplicateStrategy === "keep-first" ? "保留首行" : "保留末行"}。`, suggestion: "请结合原始行号核对；有冲突的分数不会再静默覆盖。" });
  if (sameNameGroups.length) issues.push({ level: "warning", module: "成绩", code: "duplicate-name", affectedCount: sameNameGroups.length, rowNumbers: sameNameGroups.flatMap((group) => group.map((score) => score.sourceRow ?? 0)).filter(Boolean).slice(0, 40), message: `发现${sameNameGroups.length}组同考试同校同名但身份不同的学生，系统未按姓名合并。`, suggestion: "请结合班级和原始行号确认；如后续提供学号，系统会自动使用稳定编号。" });
  return { scores, school: selectedSchool ?? (detectedSchools.length === 1 ? detectedSchools[0]!.school : "多校数据"), review };
};

const sheetForSubject = (workbook: XLSX.WorkBook, subject: SubjectName) => workbook.SheetNames.find((name) => normalized(name) === normalized(subject)) ?? workbook.SheetNames.find((name) => normalized(name).startsWith(normalized(subject)));
const previewRows = (sheet: XLSX.WorkSheet, maxRows = 120, maxColumns = 100): Row[] => { const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1"), lastRow = Math.min(range.e.r, range.s.r + maxRows - 1), lastColumn = Math.min(range.e.c, range.s.c + maxColumns - 1), rows: Row[] = []; for (let row = range.s.r; row <= lastRow; row += 1) { const values: Row = []; for (let column = range.s.c; column <= lastColumn; column += 1) values[column - range.s.c] = sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v ?? null; rows.push(values); } return rows; };

const parseItems = (workbook: XLSX.WorkBook, issues: ImportIssue[], classProfiles = CLASS_PROFILES) => {
  const questionBanks: Record<string, QuestionMeta[]> = {}, itemResponses: ItemResponse[] = [];
  SUBJECTS.filter((subject) => subject !== "日语").forEach((subject) => { const sheetName = sheetForSubject(workbook, subject); if (!sheetName) return; const rows = XLSX.utils.sheet_to_json<Row>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null }), metaColumns = new Map<string, number[]>();
    for (let rowIndex = 0; rowIndex < Math.min(rows.length, 120); rowIndex += 1) { const headerColumn = rows[rowIndex].findIndex((cell) => normalized(cell) === "题号"); if (headerColumn < 0) continue; const examSource = [...rows[rowIndex].slice(0, headerColumn)].reverse().find((cell) => text(cell)), exam = normalizeExam(text(examSource)); if (!exam) continue; const questions: QuestionMeta[] = [], columns: number[] = []; for (let column = headerColumn + 1; column < Math.min(rows[rowIndex].length, headerColumn + MAX_ITEM_COLUMNS); column += 1) { const question = text(rows[rowIndex][column]); if (!question || ["客观分", "主观分", "总分", "原分", "赋分"].includes(question)) continue; const maxScore = num(rows[rowIndex + 1]?.[column]); columns.push(column); questions.push({ question, maxScore, maxScoreSource: maxScore === null ? undefined : "source", knowledge: text(rows[rowIndex + 2]?.[column]), sourceColumn: column }); } if (questions.length) { questionBanks[`${subject}::${exam}`] = questions; metaColumns.set(exam, columns); } }
    rows.forEach((row) => { const rawExam = text(row[0]), classValue = num(row[1]), name = text(row[2]); if (!rawExam || classValue === null || !name || normalized(name) === "题号") return; const exam = normalizeExam(rawExam), columns = metaColumns.get(exam); if (!columns?.length) return; const scores = columns.map((column) => num(row[column])); if (!scores.some((score) => score !== null)) return; const classNo = Math.trunc(classValue), profile = getClassProfile(classNo, rawExam, classProfiles); const normalizedSubject = relevantSubjects(profile).find((target) => (profile.subjectSourceOverrides?.[target] ?? target) === subject) ?? subject; itemResponses.push({ subject: normalizedSubject, exam, classNo, name, scores }); });
  });
  let inferredMaxScores = 0;
  Object.entries(questionBanks).forEach(([key, questions]) => { const [sourceSubject, exam] = key.split("::") as [SubjectName, string], compatibleSubjects: SubjectName[] = sourceSubject === "英语" ? ["英语", "日语"] : sourceSubject === "生物" ? ["生物", "地理"] : [sourceSubject], responses = itemResponses.filter((row) => row.exam === exam && compatibleSubjects.includes(row.subject)); questions.forEach((question, index) => { if (question.maxScore !== null) return; const observed = responses.map((response) => response.scores[index]).filter((value): value is number => typeof value === "number"), inferred = observed.length ? Math.max(...observed) : 0; if (inferred > 0) { question.maxScore = inferred; question.maxScoreSource = "inferred"; inferredMaxScores += 1; } }); });
  if (inferredMaxScores) issues.push({ level: "info", module: "小题", affectedCount: inferredMaxScores, message: `${inferredMaxScores}个缺失小题满分已按实际最高得分推断，得分率可继续使用。`, suggestion: "补充源表“分值”行后可恢复最高置信度。" });
  const weakMetadata = Object.values(questionBanks).flat().filter((question) => question.maxScore === null || !question.knowledge).length; if (weakMetadata) issues.push({ level: "info", module: "小题", affectedCount: weakMetadata, message: `${weakMetadata}个小题缺少分值或知识点，已有得分仍可分析。`, suggestion: "补充分值和知识点后可恢复完整知识图谱。" });
  return { questionBanks, itemResponses };
};

const buildProfile = (scores: StudentScore[], thresholds: Threshold[], itemResponses: ItemResponse[], exams: string[], fieldMatches: FieldMatch[], headerRow: number | null, reconstructedTotals: number, skippedRows: number, classProfiles = CLASS_PROFILES): DataProfile => {
  const expected = scores.reduce((sum, score) => sum + relevantSubjects(getClassProfile(score.classNo, score.rawExam, classProfiles)).length, 0), present = scores.reduce((sum, score) => sum + relevantSubjects(getClassProfile(score.classNo, score.rawExam, classProfiles)).filter((subject) => typeof score.subjects[subject] === "number").length, 0), subjectCompleteness = expected ? present / expected : 0;
  const thresholdExpected = exams.reduce((sum, exam) => sum + uniq(scores.filter((score) => score.exam === exam).map((score) => score.track)).filter((track) => track !== "未配置").length, 0), thresholdComplete = thresholds.filter((threshold) => typeof threshold.topTotal === "number" && typeof threshold.undergraduateTotal === "number").length, thresholdCompleteness = thresholdExpected ? Math.min(1, thresholdComplete / thresholdExpected) : 0;
  const latestExam = exams.at(-1), latestScores = scores.filter((score) => score.exam === latestExam), itemKeys = new Set(itemResponses.filter((row) => row.exam === latestExam).map((row) => `${row.classNo}::${row.name}`)), itemCoverage = latestScores.length ? latestScores.filter((score) => itemKeys.has(`${score.classNo}::${score.name}`)).length / latestScores.length : 0;
  const requiredConfidence = fieldMatches.filter((field) => ["考试", "班级", "姓名", "总分"].includes(field.field)).reduce((sum, field) => sum + field.confidence, 0) / 4, overallConfidence = clamp(requiredConfidence * .36 + subjectCompleteness * .27 + thresholdCompleteness * .18 + Math.min(1, itemCoverage) * .12 + (scores.length ? .07 : 0));
  const capabilities: DataCapability[] = [{ id: "overview", label: "总分总览", available: scores.length > 0, confidence: requiredConfidence, reason: scores.length ? "考试、班级、姓名和总分可用" : "缺少核心成绩字段" }, { id: "classes", label: "班级对比", available: scores.length > 0, confidence: scores.length ? .98 : 0, reason: "按已识别班级独立计算" }, { id: "subjects", label: "学科诊断", available: subjectCompleteness > .2, confidence: subjectCompleteness, reason: `学科字段完整度${Math.round(subjectCompleteness * 100)}%` }, { id: "students", label: "学生画像", available: scores.length > 0, confidence: subjectCompleteness, reason: "缺失学科显示为“—”" }, { id: "online", label: "上线临界", available: thresholdComplete > 0, confidence: thresholdCompleteness, reason: `双分数线完整度${Math.round(thresholdCompleteness * 100)}%` }, { id: "items", label: "小题知识点", available: itemResponses.length > 0, confidence: Math.min(1, itemCoverage), reason: itemResponses.length ? `最新考试覆盖约${Math.round(itemCoverage * 100)}%` : "未识别小题数据" }, { id: "history", label: "历次趋势", available: exams.length > 1, confidence: exams.length > 1 ? .96 : .4, reason: `识别${exams.length}次考试` }, { id: "reports", label: "报告导出", available: scores.length > 0, confidence: overallConfidence, reason: "按可用模块自动编排" }];
  return { overallConfidence, scoreHeaderRow: headerRow, subjectCompleteness, thresholdCompleteness, itemCoverage, reconstructedTotals, skippedRows, fieldMatches, capabilities };
};

export async function parseGradeWorkbook(file: File, options: GradeImportOptions = {}): Promise<GradeDataset> {
  if (file.size > 160 * 1024 * 1024) throw new Error("工作簿超过160MB，请先删除无关图片或拆分历史数据后再导入。");
  let workbook: XLSX.WorkBook; try { workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true }); } catch { throw new Error("工作簿无法读取，可能已损坏、加密或不是有效Excel文件；原有数据不会被覆盖。"); }
  const issues: ImportIssue[] = [];
  let baseSheetName = workbook.SheetNames.find((name) => normalized(name) === "学生基础") ?? "";
  if (!baseSheetName) { baseSheetName = workbook.SheetNames.map((name) => { const sheet = workbook.Sheets[name], headerRow = findScoreHeader(previewRows(sheet)), range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1"); return { name, headerRow, rowCount: range.e.r - range.s.r + 1, nameHint: /学生|成绩|基础/.test(name) ? 1 : 0 }; }).filter((candidate) => candidate.headerRow !== null).sort((a, b) => b.nameHint - a.nameHint || b.rowCount - a.rowCount)[0]?.name ?? ""; if (baseSheetName) issues.push({ level: "info", module: "成绩", message: `未找到“学生基础”，已根据表头自动使用“${baseSheetName}”。` }); }
  if (!baseSheetName) throw new Error("没有找到包含考试、班级、姓名和成绩的工作表；原有数据不会被覆盖。");
  const classProfiles = options.classProfiles ?? CLASS_PROFILES;
  const baseRows = XLSX.utils.sheet_to_json<Row>(workbook.Sheets[baseSheetName], { header: 1, raw: true, defval: null }), parsedThresholds = parseThresholds(baseRows, issues), scoreResult = parseScores(baseRows, issues, classProfiles), selected = applyImportOptions(scoreResult.scores, issues, options), itemResult = parseItems(workbook, issues, classProfiles), exams = uniq(selected.scores.map((score) => score.exam)), thresholds = parsedThresholds.filter((threshold) => exams.includes(threshold.exam));
  if (!selected.scores.length) throw new Error("工作簿中没有可用学生成绩；请检查考试、班级、姓名和总分字段。");
  selected.review.skippedRows = scoreResult.skippedRows;
  const profile = buildProfile(selected.scores, thresholds, itemResult.itemResponses, exams, scoreResult.fieldMatches, scoreResult.headerRow, selected.scores.filter((score) => score.totalSource === "reconstructed").length, scoreResult.skippedRows, classProfiles);
  if (profile.subjectCompleteness < .98) issues.push({ level: "warning", module: "成绩", message: `学科完整度为${(profile.subjectCompleteness * 100).toFixed(1)}%；缺失学科只关闭相关指标，不按0分。` });
  if (profile.thresholdCompleteness < .98) issues.push({ level: "warning", module: "分数线", message: `双分数线完整度为${(profile.thresholdCompleteness * 100).toFixed(1)}%；只计算有分数线的考试与类别。` });
  if (!itemResult.itemResponses.length) issues.push({ level: "warning", module: "小题", message: "未识别到小题明细，成绩、班级、学科和临界生分析仍可使用。" });
  issues.push({ level: "info", module: "系统", message: "已启用特殊口径：7班英语列按日语处理，9班生物列按地理处理。" });
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, sourceName: file.name, importedAt: new Date().toISOString(), school: selected.school, exams, scores: selected.scores, thresholds, questionBanks: itemResult.questionBanks, itemResponses: itemResult.itemResponses, issues, sheets: workbook.SheetNames, classProfiles, profile, importReview: selected.review, importCandidates: scoreResult.scores, importThresholds: parsedThresholds };
}

export function configureGradeImport(dataset: GradeDataset, options: GradeImportOptions): GradeDataset {
  const candidates = dataset.importCandidates ?? dataset.scores;
  const baseIssues = dataset.issues.filter((issue) => !["missing-student-id", "multiple-schools", "duplicate-record", "duplicate-name"].includes(issue.code ?? ""));
  const selected = applyImportOptions(candidates, baseIssues, options);
  selected.review.skippedRows = dataset.profile?.skippedRows ?? 0;
  const exams = uniq(selected.scores.map((score) => score.exam));
  const thresholds = (dataset.importThresholds ?? dataset.thresholds).filter((threshold) => exams.includes(threshold.exam));
  const profile = buildProfile(selected.scores, thresholds, dataset.itemResponses, exams, dataset.profile?.fieldMatches ?? [], dataset.profile?.scoreHeaderRow ?? null, selected.scores.filter((score) => score.totalSource === "reconstructed").length, selected.review.skippedRows, dataset.classProfiles);
  return { ...dataset, school: selected.school, exams, scores: selected.scores, thresholds, issues: baseIssues, profile, importReview: selected.review };
}

export function finalizeGradeImport(dataset: GradeDataset): GradeDataset {
  const finalized = { ...dataset };
  delete finalized.importCandidates;
  delete finalized.importThresholds;
  return finalized;
}
