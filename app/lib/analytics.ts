import { getClassProfile, relevantSubjects } from "./class-config";
import type { ClassSummary, GradeDataset, StudentScore, SubjectName, SubjectSummary, Threshold, Track } from "./types";

export const average = (values: number[]): number => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export type DescriptiveStats = { count: number; average: number; median: number; p25: number; p75: number; min: number; max: number; standardDeviation: number };
export type DistributionBin = { label: string; start: number; end: number; count: number; rate: number };
export type ClassBenchmark = ClassSummary & { peerGroup: string; peerAverage: number; averageDelta: number; peerTopRate: number; topRateDelta: number; peerUndergraduateRate: number; undergraduateRateDelta: number; peerRank: number; peerSize: number };
export type ScoreSegment = { id: "high" | "top" | "top-critical" | "undergraduate" | "undergraduate-critical" | "foundation" | "unclassified"; label: string; count: number; rate: number; average: number; intent: string };
export type KnowledgeSummary = { knowledge: string; questionCount: number; responseCount: number; earned: number; possible: number; rate: number; priority: "优势保持" | "巩固提升" | "优先补弱" };
export type ExecutiveInsight = { id: "distribution" | "conversion" | "subject" | "class" | "trend" | "quality"; tone: "good" | "warn" | "attention" | "neutral"; title: string; finding: string; action: string };

const quantile = (sorted: number[], position: number): number => {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index), upper = Math.ceil(index);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
};

export const descriptiveStats = (values: number[]): DescriptiveStats => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const mean = average(sorted);
  return { count: sorted.length, average: mean, median: quantile(sorted, .5), p25: quantile(sorted, .25), p75: quantile(sorted, .75), min: sorted[0] ?? 0, max: sorted.at(-1) ?? 0, standardDeviation: sorted.length ? Math.sqrt(sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length) : 0 };
};

export const distributionBins = (values: number[], step = 50): DistributionBin[] => {
  const safe = values.filter(Number.isFinite);
  if (!safe.length) return [];
  const first = Math.floor(Math.min(...safe) / step) * step;
  const last = Math.ceil(Math.max(...safe) / step) * step;
  const bins = Array.from({ length: Math.max(1, Math.ceil((last - first) / step)) }, (_, index) => { const start = first + index * step; return { label: `${start}–${start + step - 1}`, start, end: start + step, count: 0, rate: 0 }; });
  safe.forEach((value) => { const index = Math.min(bins.length - 1, Math.max(0, Math.floor((value - first) / step))); bins[index].count += 1; });
  return bins.map((bin) => ({ ...bin, rate: bin.count / safe.length }));
};

export const getThreshold = (dataset: GradeDataset, exam: string, track: Track): Threshold | undefined => dataset.thresholds.find((threshold) => threshold.exam === exam && threshold.track === track);
export const filterScores = (dataset: GradeDataset, exam: string, track: Track | "全部", classNo: number | "全部" = "全部") => dataset.scores.filter((score) => score.exam === exam && (track === "全部" || score.track === track) && (classNo === "全部" || score.classNo === classNo));

export const classSummaries = (dataset: GradeDataset, exam: string, track: Track | "全部"): ClassSummary[] => {
  const groups = new Map<number, StudentScore[]>();
  filterScores(dataset, exam, track).forEach((score) => groups.set(score.classNo, [...(groups.get(score.classNo) ?? []), score]));
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([classNo, students]) => {
    const profile = getClassProfile(classNo), threshold = getThreshold(dataset, exam, profile.track);
    const topLine = threshold?.topTotal, undergraduateLine = threshold?.undergraduateTotal;
    const topCount = typeof topLine === "number" ? students.filter((student) => student.total >= topLine).length : 0;
    const undergraduateCount = typeof undergraduateLine === "number" ? students.filter((student) => student.total >= undergraduateLine).length : 0;
    const subjectAverages: ClassSummary["subjectAverages"] = {};
    relevantSubjects(profile).forEach((subject) => { const values = students.map((student) => student.subjects[subject]).filter((value): value is number => typeof value === "number"); if (values.length) subjectAverages[subject] = average(values); });
    return { classNo, label: profile.label, track: profile.track, type: profile.type, count: students.length, average: average(students.map((student) => student.total)), topCount, undergraduateCount, topRate: students.length ? topCount / students.length : 0, undergraduateRate: students.length ? undergraduateCount / students.length : 0, subjectAverages };
  });
};

export const classBenchmarks = (dataset: GradeDataset, exam: string, track: Track | "全部"): ClassBenchmark[] => classSummaries(dataset, exam, track).map((item, _, summaries) => {
  const key = (candidate: ClassSummary) => `${candidate.track} · ${candidate.type}`;
  let peers = summaries.filter((candidate) => key(candidate) === key(item));
  if (peers.length < 2) peers = summaries.filter((candidate) => candidate.track === item.track);
  const peerAverage = average(peers.map((candidate) => candidate.average)), peerTopRate = average(peers.map((candidate) => candidate.topRate)), peerUndergraduateRate = average(peers.map((candidate) => candidate.undergraduateRate));
  const ranked = [...peers].sort((a, b) => b.average - a.average);
  return { ...item, peerGroup: peers.every((candidate) => candidate.type === item.type) ? `${item.track} · ${item.type}` : `${item.track} · 同类别`, peerAverage, averageDelta: item.average - peerAverage, peerTopRate, topRateDelta: item.topRate - peerTopRate, peerUndergraduateRate, undergraduateRateDelta: item.undergraduateRate - peerUndergraduateRate, peerRank: ranked.findIndex((candidate) => candidate.classNo === item.classNo) + 1, peerSize: peers.length };
});

export const subjectSummaries = (dataset: GradeDataset, exam: string, track: Track | "全部", classNo: number | "全部"): SubjectSummary[] => {
  const rows = filterScores(dataset, exam, track, classNo);
  const subjects = [...new Set(rows.flatMap((row) => Object.keys(row.subjects) as SubjectName[]))];
  return subjects.map((subject) => {
    const values = rows.map((row) => row.subjects[subject]).filter((value): value is number => typeof value === "number");
    const topLines = rows.map((row) => getThreshold(dataset, exam, row.track)?.topSubjects[subject]).filter((value): value is number => typeof value === "number");
    const undergraduateLines = rows.map((row) => getThreshold(dataset, exam, row.track)?.undergraduateSubjects[subject]).filter((value): value is number => typeof value === "number");
    const topEffectiveLine = topLines.length ? average(topLines) : null, undergraduateEffectiveLine = undergraduateLines.length ? average(undergraduateLines) : null;
    const topEffectiveCount = rows.filter((row) => { const value = row.subjects[subject], line = getThreshold(dataset, exam, row.track)?.topSubjects[subject]; return typeof value === "number" && typeof line === "number" && value >= line; }).length;
    const undergraduateEffectiveCount = rows.filter((row) => { const value = row.subjects[subject], line = getThreshold(dataset, exam, row.track)?.undergraduateSubjects[subject]; return typeof value === "number" && typeof line === "number" && value >= line; }).length;
    return { subject, count: values.length, average: average(values), max: values.length ? Math.max(...values) : 0, topEffectiveCount, topEffectiveRate: values.length ? topEffectiveCount / values.length : 0, topEffectiveLine, undergraduateEffectiveCount, undergraduateEffectiveRate: values.length ? undergraduateEffectiveCount / values.length : 0, undergraduateEffectiveLine, effectiveCount: undergraduateEffectiveCount, effectiveRate: values.length ? undergraduateEffectiveCount / values.length : 0, effectiveLine: undergraduateEffectiveLine };
  });
};

export const criticalStudents = (dataset: GradeDataset, exam: string, track: Track | "全部", classNo: number | "全部") => filterScores(dataset, exam, track, classNo).map((student) => {
  const threshold = getThreshold(dataset, exam, student.track);
  const topDiff = threshold?.topTotal === null || threshold?.topTotal === undefined ? null : student.total - threshold.topTotal;
  const undergraduateDiff = threshold?.undergraduateTotal === null || threshold?.undergraduateTotal === undefined ? null : student.total - threshold.undergraduateTotal;
  const relevant = relevantSubjects(getClassProfile(student.classNo));
  const subjectDiffs = (tier: "一本" | "本科") => relevant.map((subject) => { const score = student.subjects[subject], line = tier === "一本" ? threshold?.topSubjects[subject] : threshold?.undergraduateSubjects[subject]; return typeof score === "number" && typeof line === "number" ? { subject, diff: score - line } : null; }).filter((item): item is { subject: SubjectName; diff: number } => Boolean(item)).sort((a, b) => a.diff - b.diff);
  const criticalTiers: Array<"一本" | "本科"> = [];
  if (topDiff !== null && topDiff >= -20 && topDiff < 0) criticalTiers.push("一本");
  if (undergraduateDiff !== null && undergraduateDiff >= -20 && undergraduateDiff < 0) criticalTiers.push("本科");
  const topWeakSubjects = subjectDiffs("一本"), undergraduateWeakSubjects = subjectDiffs("本科");
  return { ...student, topDiff, undergraduateDiff, criticalTiers, topWeakSubjects, undergraduateWeakSubjects, weakSubjects: criticalTiers.includes("一本") ? topWeakSubjects : undergraduateWeakSubjects };
}).filter((student) => student.criticalTiers.length > 0 && student.totalSource !== "reconstructed").sort((a, b) => Math.max(b.topDiff ?? -999, b.undergraduateDiff ?? -999) - Math.max(a.topDiff ?? -999, a.undergraduateDiff ?? -999));

export const criticalStudentsByTier = (dataset: GradeDataset, exam: string, track: Track | "全部", classNo: number | "全部", tier: "一本" | "本科") => criticalStudents(dataset, exam, track, classNo).filter((student) => student.criticalTiers.includes(tier));

export const segmentSummary = (dataset: GradeDataset, exam: string, track: Track | "全部", classNo: number | "全部"): ScoreSegment[] => {
  const rows = filterScores(dataset, exam, track, classNo), buckets = new Map<ScoreSegment["id"], StudentScore[]>();
  rows.forEach((student) => { const threshold = getThreshold(dataset, exam, student.track), top = threshold?.topTotal, undergraduate = threshold?.undergraduateTotal; let id: ScoreSegment["id"] = "unclassified"; if (student.totalSource === "reconstructed") id = "unclassified"; else if (typeof top === "number" && student.total >= top + 30) id = "high"; else if (typeof top === "number" && student.total >= top) id = "top"; else if (typeof top === "number" && student.total >= top - 20) id = "top-critical"; else if (typeof undergraduate === "number" && student.total >= undergraduate) id = "undergraduate"; else if (typeof undergraduate === "number" && student.total >= undergraduate - 20) id = "undergraduate-critical"; else if (typeof undergraduate === "number") id = "foundation"; buckets.set(id, [...(buckets.get(id) ?? []), student]); });
  const definitions: Array<Pick<ScoreSegment, "id" | "label" | "intent">> = [{ id: "high", label: "高位一本", intent: "保持高阶能力，强化拔尖与稳定性" }, { id: "top", label: "一本上线", intent: "稳住优势学科，修补单科波动" }, { id: "top-critical", label: "一本临界", intent: "优先补足最短学科，争取转化" }, { id: "undergraduate", label: "本科稳固", intent: "先稳本科，再向一本区间推进" }, { id: "undergraduate-critical", label: "本科临界", intent: "控制基础失分，建立逐人清单" }, { id: "foundation", label: "基础巩固", intent: "聚焦高频基础题与可得分模块" }, { id: "unclassified", label: "待分层", intent: "补充分数线后恢复精确分层" }];
  return definitions.map((definition) => { const students = buckets.get(definition.id) ?? []; return { ...definition, count: students.length, rate: rows.length ? students.length / rows.length : 0, average: average(students.map((student) => student.total)) }; }).filter((segment) => segment.count > 0);
};

export const knowledgeSummaries = (dataset: GradeDataset, exam: string, subject: SubjectName, track: Track | "全部", classNo: number | "全部"): KnowledgeSummary[] => {
  const sourceSubject: SubjectName = subject === "日语" ? "英语" : subject === "地理" && (classNo === 9 || (classNo === "全部" && track === "物理类")) ? "生物" : subject;
  const questions = dataset.questionBanks[`${sourceSubject}::${exam}`] ?? [], allowedStudents = new Set(filterScores(dataset, exam, track, classNo).map((row) => `${row.classNo}::${row.name}`));
  const responses = dataset.itemResponses.filter((row) => row.subject === subject && row.exam === exam && allowedStudents.has(`${row.classNo}::${row.name}`));
  const groups = new Map<string, { questionIndexes: number[] }>();
  questions.forEach((question, index) => { const knowledge = question.knowledge || "未标注知识点", current = groups.get(knowledge) ?? { questionIndexes: [] }; current.questionIndexes.push(index); groups.set(knowledge, current); });
  return [...groups.entries()].map(([knowledge, group]) => { let earned = 0, possible = 0, responseCount = 0; group.questionIndexes.forEach((questionIndex) => { const maxScore = questions[questionIndex]?.maxScore; if (typeof maxScore !== "number" || maxScore <= 0) return; responses.forEach((response) => { const score = response.scores[questionIndex]; if (typeof score !== "number") return; earned += score; possible += maxScore; responseCount += 1; }); }); const rate = possible ? earned / possible : 0; const priority: KnowledgeSummary["priority"] = rate >= .8 ? "优势保持" : rate >= .62 ? "巩固提升" : "优先补弱"; return { knowledge, questionCount: group.questionIndexes.length, responseCount, earned, possible, rate, priority }; }).filter((item) => item.responseCount > 0).sort((a, b) => a.rate - b.rate);
};

export const buildExecutiveInsights = (dataset: GradeDataset, exam: string, track: Track | "全部", classNo: number | "全部"): ExecutiveInsight[] => {
  const rows = filterScores(dataset, exam, track, classNo); if (!rows.length) return [];
  const stats = descriptiveStats(rows.map((row) => row.total)), segments = segmentSummary(dataset, exam, track, classNo), subjects = subjectSummaries(dataset, exam, track, classNo).filter((item) => item.count > 0), critical = criticalStudents(dataset, exam, track, classNo), previousExam = dataset.exams[dataset.exams.indexOf(exam) - 1], previousRows = previousExam ? filterScores(dataset, previousExam, track, classNo) : [], weakest = [...subjects].sort((a, b) => a.undergraduateEffectiveRate - b.undergraduateEffectiveRate)[0], topCritical = critical.filter((item) => item.criticalTiers.includes("一本")).length, undergraduateCritical = critical.filter((item) => item.criticalTiers.includes("本科")).length, largestSegment = [...segments].sort((a, b) => b.count - a.count)[0];
  const insights: ExecutiveInsight[] = [{ id: "distribution", tone: stats.standardDeviation > 105 ? "attention" : "neutral", title: "成绩离散度", finding: `中位数${stats.median.toFixed(1)}分，四分位区间${stats.p25.toFixed(1)}–${stats.p75.toFixed(1)}分，标准差${stats.standardDeviation.toFixed(1)}。`, action: stats.standardDeviation > 105 ? "分层差异较大，备课与作业应至少拆分为基础、提升两套任务。" : "整体离散度可控，继续关注尾部学生与局部学科波动。" }, { id: "conversion", tone: topCritical + undergraduateCritical > rows.length * .08 ? "warn" : "good", title: "临界转化机会", finding: `一本临界${topCritical}人，本科临界${undergraduateCritical}人；当前最大分层为“${largestSegment?.label ?? "待识别"}”。`, action: topCritical + undergraduateCritical ? "按总分差距与薄弱学科交叉排序，先干预线下10分以内学生。" : "当前未发现线下20分临界生，重点转向上线稳定性与高分拔尖。" }];
  if (weakest) insights.push({ id: "subject", tone: weakest.undergraduateEffectiveRate < .55 ? "attention" : "warn", title: "学科短板", finding: `${weakest.subject}本科有效率${(weakest.undergraduateEffectiveRate * 100).toFixed(1)}%，在当前可比学科中最低。`, action: "下钻小题与知识点，优先处理低得分率且覆盖人数高的共性问题。" });
  if (classNo === "全部") { const benchmarks = classBenchmarks(dataset, exam, track), strongest = [...benchmarks].sort((a, b) => b.averageDelta - a.averageDelta)[0], weakestClass = [...benchmarks].sort((a, b) => a.averageDelta - b.averageDelta)[0]; if (strongest && weakestClass) insights.push({ id: "class", tone: Math.abs(weakestClass.averageDelta) >= 15 ? "attention" : "neutral", title: "同类班级差异", finding: `${strongest.classNo}班较同组均分高${Math.abs(strongest.averageDelta).toFixed(1)}分；${weakestClass.classNo}班较同组均分${weakestClass.averageDelta >= 0 ? "高" : "低"}${Math.abs(weakestClass.averageDelta).toFixed(1)}分。`, action: "优先在相同类别与班型内复盘教学差异，避免直接跨层次比较。" }); }
  if (previousRows.length) { const delta = stats.average - average(previousRows.map((row) => row.total)); insights.push({ id: "trend", tone: delta >= 0 ? "good" : "warn", title: "阶段变化", finding: `较${previousExam}平均分${delta >= 0 ? "提高" : "下降"}${Math.abs(delta).toFixed(1)}分。`, action: delta >= 0 ? "保留有效教学动作，并检查提升是否覆盖各分层。" : "结合班级、学科和小题三个层级定位下降来源。" }); }
  insights.push({ id: "quality", tone: (dataset.profile?.overallConfidence ?? 0) >= .9 ? "good" : "warn", title: "结论可信度", finding: `当前工作簿综合识别置信度${((dataset.profile?.overallConfidence ?? 0) * 100).toFixed(1)}%。`, action: (dataset.profile?.overallConfidence ?? 0) >= .9 ? "核心结论可直接用于复盘，缺失模块仍以质检提示为准。" : "引用结论时同时查看数据健康度，避免扩展到缺失字段。" });
  return insights;
};
