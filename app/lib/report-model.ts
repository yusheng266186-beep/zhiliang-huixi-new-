import { percentage } from "./format";
import {
  onlineSummary,
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
  trend: Array<{ exam: string; count: number; average: number; topCount: number; undergraduateCount: number }>;
  quality: {
    confidence: number;
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

const pct = percentage;

const recommendationsFor = (model: Pick<QualityReportModel, "insights" | "segments" | "subjects" | "knowledge" | "classes" | "critical">): string[] => {
  const recommendations: string[] = [];
  model.insights.forEach((insight) => recommendations.push(`${insight.title}：${insight.action}`));
  const weakest = model.subjects.filter(s => Number.isFinite(s.undergraduateEffectiveRate)).sort((a, b) => a.undergraduateEffectiveRate - b.undergraduateEffectiveRate)[0];
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
  const online = onlineSummary(dataset, exam, rows);
  const {topCount, undergraduateCount} = online;
  const critical = criticalStudents(dataset, exam, track, classNo);
  const classes = classBenchmarks(dataset, exam, track).filter((item) => classNo === "全部" || item.classNo === classNo);
  const subjects = subjectSummaries(dataset, exam, track, classNo);
  const knowledgeSubject = subject ?? subjects.filter(s=>Number.isFinite(s.undergraduateEffectiveRate)).sort((a, b) => a.undergraduateEffectiveRate - b.undergraduateEffectiveRate)[0]?.subject ?? "语文";
  const knowledge = knowledgeSummaries(dataset, exam, knowledgeSubject, track, classNo);
  const segments = segmentSummary(dataset, exam, track, classNo);
  const insights = buildExecutiveInsights(dataset, exam, track, classNo);
  const trend = dataset.exams.slice(0, dataset.exams.indexOf(exam)+1).map(examName => {
    const examRows = filterScores(dataset,examName,track,classNo), summary = onlineSummary(dataset,examName,examRows);
    return { exam: examName, count: examRows.length, average: average(examRows.map(r=>r.total)), topCount: summary.topCount, undergraduateCount: summary.undergraduateCount };
  }).filter(r=>r.count>0);
  const profile = dataset.profile;
  const warningCount = dataset.issues.filter((issue) => issue.level === "warning").length;
  const errorCount = dataset.issues.filter((issue) => issue.level === "error").length;
  const availableModules = (profile?.capabilities ?? []).filter((item) => item.id === "items" ? dataset.itemResponses.some(r=>r.exam===exam && rows.some(s=>s.classNo===r.classNo && s.name===r.name)) : item.available).map((item) => item.label);
  const quality = { confidence: profile?.overallConfidence ?? 0, subjectCompleteness: profile?.subjectCompleteness ?? 0, thresholdCompleteness: profile?.thresholdCompleteness ?? 0, itemCoverage: rows.length ? rows.filter(s => dataset.itemResponses.some(r=>r.exam===exam && r.classNo===s.classNo && r.name===s.name)).length/rows.length : 0, reconstructedTotals: profile?.reconstructedTotals ?? 0, warnings: warningCount, errors: errorCount, availableModules };
  const summary = { count: rows.length, average: stats.average, median: stats.median, topCount, topRate: online.topRate, undergraduateCount, undergraduateRate: online.undergraduateRate, topCriticalCount: critical.filter((item) => item.criticalTiers.includes("一本")).length, undergraduateCriticalCount: critical.filter((item) => item.criticalTiers.includes("本科")).length };
  const model: QualityReportModel = {
    reportType, exam, track, classNo, subject, title: `${exam} · ${reportType}`, focusStatement: focusByType[reportType], scope: `${track}${classNo === "全部" ? " · 全部班级" : ` · ${classNo}班`}`, generatedAt: new Date().toISOString(), summary, stats, distribution: distributionBins(rows.map((row) => row.total)), segments, classes, subjects, critical, knowledge, insights, recommendations: [], trend, quality, methodology: [`本次一本指标可计算${online.topEligible}人，本科指标可计算${online.undergraduateEligible}人；比率分母仅包含有适用分数线且总分非重建者。`, "历次原始均分不等于教学增值；考试难度、满分及赋分规则需核验。","以学生基础表中可识别的考试、班级、姓名和总分作为主键。", "总分优先采用源表总分；缺失时仅在至少4门有效学科存在时重建，并标记来源。", "学科均值只使用该学科的有效成绩，缺失学科不按0分进入分母。", "上线口径按考试与类别匹配一本/特控线、本科线；未配置分数线的指标显示为不可用。", "班级对标优先按类别与班型建立同类组，样本不足时退回同类别比较。", "小题得分率按可识别满分计算；源表缺失满分时不计算正式得分率，也不生成补弱结论。"], sourceName: dataset.sourceName,
  };
  model.recommendations = recommendationsFor(model);
  return model;
}

export { getClassProfile, relevantSubjects };
