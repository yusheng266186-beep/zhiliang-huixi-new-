import {
  average,
  buildExecutiveInsights,
  classBenchmarks,
  criticalStudents,
  descriptiveStats,
  distributionBins,
  filterScores,
  knowledgeSummaries,
  segmentSummary,
  subjectSummaries,
} from "./analytics";
import { getClassProfile, relevantSubjects } from "./class-config";
import type { GradeDataset, SubjectName, Track } from "./types";

export type ReportType = "年级质量分析" | "班级成绩分析" | "学科质量分析" | "上线与临界生";

export type QualityReportModel = {
  reportType: ReportType;
  exam: string;
  track: Track | "全部";
  classNo: number | "全部";
  subject?: SubjectName;
  title: string;
  focusStatement: string;
  scope: string;
  generatedAt: string;
  summary: {
    count: number;
    average: number;
    median: number;
    topCount: number;
    topRate: number;
    undergraduateCount: number;
    undergraduateRate: number;
    topCriticalCount: number;
    undergraduateCriticalCount: number;
  };
  stats: ReturnType<typeof descriptiveStats>;
  distribution: ReturnType<typeof distributionBins>;
  segments: ReturnType<typeof segmentSummary>;
  classes: ReturnType<typeof classBenchmarks>;
  subjects: ReturnType<typeof subjectSummaries>;
  critical: ReturnType<typeof criticalStudents>;
  knowledge: ReturnType<typeof knowledgeSummaries>;
  insights: ReturnType<typeof buildExecutiveInsights>;
  recommendations: string[];
  trend: Array<{ exam: string; count: number; average: number; topLineIndex: number | null; topCount: number; topRate: number; undergraduateCount: number; undergraduateRate: number }>;
  students: GradeDataset["scores"];
  thresholds: GradeDataset["thresholds"];
  fieldMatches: NonNullable<GradeDataset["profile"]>["fieldMatches"];
  issues: GradeDataset["issues"];
  school: string;
  importedAt: string;
  sheets: string[];
  quality: {
    score: number;
    confidence: number;
    identityCoverage: number;
    subjectCompleteness: number;
    thresholdCompleteness: number;
    itemCoverage: number;
    reconstructedTotals: number;
    warnings: number;
    errors: number;
    availableModules: string[];
  };
  methodology: string[];
  sourceName: string;
};

const focusByType: Record<ReportType, string> = {
  年级质量分析: "回答年级整体质量、分数分布、班级差异与下一阶段教学优先级。",
  班级成绩分析: "回答当前班级相对同类班的位次、上线转化与学生分层。",
  学科质量分析: "回答学科有效上线、知识点得分率与可执行的补弱顺序。",
  上线与临界生: "回答每一位临界学生距离目标线的分数差与最短板学科。",
};

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

const recommendationsFor = (model: Pick<QualityReportModel, "insights" | "segments" | "subjects" | "knowledge" | "classes" | "critical">): string[] => {
  const recommendations: string[] = [];
  model.insights.forEach((insight) => recommendations.push(`${insight.title}：${insight.action}`));
  const weakest = [...model.subjects].sort((a, b) => a.undergraduateEffectiveRate - b.undergraduateEffectiveRate)[0];
  if (weakest) recommendations.push(`学科行动：将${weakest.subject}列为首轮集体备课主题，先处理有效上线率${pct(weakest.undergraduateEffectiveRate)}且覆盖人数高的共性失分。`);
  const knowledge = model.knowledge.filter((item) => item.priority === "优先补弱").slice(0, 3);
  if (knowledge.length) recommendations.push(`知识点行动：优先复盘${knowledge.map((item) => item.knowledge).join("、")}，用小题—知识点—学生三层清单闭环。`);
  const weakestClass = [...model.classes].sort((a, b) => a.averageDelta - b.averageDelta)[0];
  if (weakestClass && weakestClass.averageDelta < -5) recommendations.push(`班级行动：${weakestClass.classNo}班较${weakestClass.peerGroup}低${Math.abs(weakestClass.averageDelta).toFixed(1)}分，建议进行同类班级联合备课与周测追踪。`);
  if (model.critical.length) recommendations.push(`临界行动：按总分线下差、最短学科和班级归属排序，每周更新一次${model.critical.length}人的跟踪表。`);
  if (model.segments.length) recommendations.push(`分层行动：将“${model.segments[0].label}”与基础巩固层分别设计任务，不用一套作业覆盖所有学生。`);
  return [...new Set(recommendations)].slice(0, 10);
};

export function buildQualityReport(dataset: GradeDataset, options: { exam: string; track: Track | "全部"; classNo: number | "全部"; reportType: ReportType; subject?: SubjectName }): QualityReportModel {
  const { exam, track, classNo, reportType, subject } = options;
  const rows = filterScores(dataset, exam, track, classNo);
  const stats = descriptiveStats(rows.map((row) => row.total));
  const lines = rows.map((row) => ({ top: dataset.thresholds.find((threshold) => threshold.exam === exam && threshold.track === row.track)?.topTotal, undergraduate: dataset.thresholds.find((threshold) => threshold.exam === exam && threshold.track === row.track)?.undergraduateTotal }));
  const topCount = rows.filter((_, index) => typeof lines[index]?.top === "number" && rows[index]!.total >= lines[index]!.top!).length;
  const undergraduateCount = rows.filter((_, index) => typeof lines[index]?.undergraduate === "number" && rows[index]!.total >= lines[index]!.undergraduate!).length;
  const critical = criticalStudents(dataset, exam, track, classNo);
  const classes = classBenchmarks(dataset, exam, track).filter((item) => classNo === "全部" || item.classNo === classNo);
  const subjects = subjectSummaries(dataset, exam, track, classNo);
  const knowledgeSubject = subject ?? subjects.sort((a, b) => a.undergraduateEffectiveRate - b.undergraduateEffectiveRate)[0]?.subject ?? "语文";
  const knowledge = knowledgeSummaries(dataset, exam, knowledgeSubject, track, classNo);
  const segments = segmentSummary(dataset, exam, track, classNo);
  const insights = buildExecutiveInsights(dataset, exam, track, classNo);
  const trend = dataset.exams.map((examName) => {
    const examRows = filterScores(dataset, examName, track, classNo);
    const examThreshold = (row: typeof examRows[number]) => dataset.thresholds.find((threshold) => threshold.exam === examName && threshold.track === row.track);
    const topCount = examRows.filter((row) => typeof examThreshold(row)?.topTotal === "number" && row.total >= examThreshold(row)!.topTotal!).length;
    const undergraduateCount = examRows.filter((row) => typeof examThreshold(row)?.undergraduateTotal === "number" && row.total >= examThreshold(row)!.undergraduateTotal!).length;
    const comparableRows = examRows.map((row) => ({ row, line: examThreshold(row)?.topTotal })).filter((item): item is { row: typeof examRows[number]; line: number } => typeof item.line === "number" && item.line > 0);
    const topLineIndex = comparableRows.length ? average(comparableRows.map(({ row, line }) => row.total / line * 100)) : null;
    return { exam: examName, count: examRows.length, average: average(examRows.map((row) => row.total)), topLineIndex, topCount, topRate: examRows.length ? topCount / examRows.length : 0, undergraduateCount, undergraduateRate: examRows.length ? undergraduateCount / examRows.length : 0 };
  }).filter((item) => item.count > 0);
  const profile = dataset.profile;
  const scoringIssues = dataset.issues.filter((issue) => issue.code !== "missing-student-id");
  const warningCount = scoringIssues.filter((issue) => issue.level === "warning").length;
  const errorCount = scoringIssues.filter((issue) => issue.level === "error").length;
  const availableModules = (profile?.capabilities ?? []).filter((item) => item.available).map((item) => item.label);
  const expectedSubjectCells = rows.reduce((sum, row) => sum + relevantSubjects(getClassProfile(row.classNo, row.rawExam, dataset.classProfiles)).length, 0);
  const presentSubjectCells = rows.reduce((sum, row) => sum + relevantSubjects(getClassProfile(row.classNo, row.rawExam, dataset.classProfiles)).filter((item) => typeof row.subjects[item] === "number").length, 0);
  const subjectCompleteness = expectedSubjectCells ? presentSubjectCells / expectedSubjectCells : 0;
  const activeTracks = [...new Set(rows.map((row) => row.track))];
  const thresholdCompleteness = activeTracks.length ? activeTracks.filter((item) => { const line = dataset.thresholds.find((threshold) => threshold.exam === exam && threshold.track === item); return typeof line?.topTotal === "number" && typeof line?.undergraduateTotal === "number"; }).length / activeTracks.length : 0;
  const identityCoverage = dataset.importReview?.identityCoverage ?? (dataset.scores.length ? dataset.scores.filter((row) => row.studentId).length / dataset.scores.length : 0);
  const confidence = profile?.overallConfidence ?? 0;
  const issuePenalty = Math.min(12, errorCount * 6 + warningCount * 2);
  const score = rows.length ? Math.max(0, Math.round(subjectCompleteness * 40 + thresholdCompleteness * 25 + confidence * 35 - issuePenalty)) : 0;
  const quality = { score, confidence, identityCoverage, subjectCompleteness, thresholdCompleteness, itemCoverage: profile?.itemCoverage ?? 0, reconstructedTotals: profile?.reconstructedTotals ?? 0, warnings: warningCount, errors: errorCount, availableModules };
  const summary = { count: rows.length, average: stats.average, median: stats.median, topCount, topRate: rows.length ? topCount / rows.length : 0, undergraduateCount, undergraduateRate: rows.length ? undergraduateCount / rows.length : 0, topCriticalCount: critical.filter((item) => item.criticalTiers.includes("一本")).length, undergraduateCriticalCount: critical.filter((item) => item.criticalTiers.includes("本科")).length };
  const model: QualityReportModel = {
    reportType, exam, track, classNo, subject, title: `${exam} · ${reportType}`, focusStatement: focusByType[reportType], scope: `${track}${classNo === "全部" ? " · 全部班级" : ` · ${classNo}班`}`, generatedAt: new Date().toISOString(), summary, stats, distribution: distributionBins(rows.map((row) => row.total)), segments, classes, subjects, critical, knowledge, insights, recommendations: [], trend, students: rows, thresholds: dataset.thresholds.filter((item) => item.exam === exam && (track === "全部" || item.track === track)), fieldMatches: dataset.profile?.fieldMatches ?? [], issues: dataset.issues, school: dataset.school, importedAt: dataset.importedAt, sheets: dataset.sheets, quality, methodology: ["学号为可选字段，不参与数据质量评分；有学号时优先按学校＋学号关联，无学号时按学校＋考试＋班级＋姓名关联，并保留源表行号。", "总分优先采用源表总分；缺失时仅在至少4门有效学科存在时重建，并标记来源。", "学科均值只使用该学科的有效成绩，缺失学科不按0分进入分母。", "上线口径按考试与类别匹配一本/特控线、本科线；未配置分数线的指标显示为不可用。", "班级对标优先按类别与班型建立同类组，样本不足时退回同类别比较。", "小题得分率按可识别满分计算；源表缺失满分时以观察到的最高得分推断并在质检中提示。", "所有报告、网页指标和Excel明细共用同一份筛选后的分析模型。"], sourceName: dataset.sourceName,
  };
  model.recommendations = recommendationsFor(model);
  return model;
}

export { getClassProfile, relevantSubjects };
