import { readFile } from "node:fs/promises";
import { parseGradeWorkbook } from "../app/lib/parser";
import { buildExecutiveInsights, classBenchmarks, descriptiveStats, distributionBins, filterScores, knowledgeSummaries, segmentSummary, subjectSummaries } from "../app/lib/analytics";
import { buildQualityReport } from "../app/lib/report-model";

const input = process.argv[2] ?? "/workspace/scratch/6b70ba3345f8/recovered/高2024级4册质量复盘1（小题得分）2025.7.16 (1).xlsx";
const bytes = await readFile(input);
const dataset = await parseGradeWorkbook(new File([bytes], "analytics.xlsx"));
const exam = dataset.exams.includes("4册") ? "4册" : dataset.exams.at(-1)!;
const rows = filterScores(dataset, exam, "物理类", "全部");
const stats = descriptiveStats(rows.map((row) => row.total));
const bins = distributionBins(rows.map((row) => row.total));
const segments = segmentSummary(dataset, exam, "物理类", "全部");
const benchmarks = classBenchmarks(dataset, exam, "物理类");
const subjects = subjectSummaries(dataset, exam, "物理类", "全部");
const knowledgeSubject = [...subjects].sort((a, b) => a.undergraduateEffectiveRate - b.undergraduateEffectiveRate)[0]?.subject ?? "语文";
const knowledge = knowledgeSummaries(dataset, exam, knowledgeSubject, "物理类", "全部");
const insights = buildExecutiveInsights(dataset, exam, "物理类", "全部");
if (!rows.length || stats.count !== rows.length || stats.p25 > stats.median || stats.median > stats.p75) throw new Error("descriptive statistics failed");
if (bins.reduce((sum, bin) => sum + bin.count, 0) !== rows.length) throw new Error("distribution bins do not conserve rows");
if (segments.reduce((sum, segment) => sum + segment.count, 0) !== rows.length) throw new Error("score segments do not conserve rows");
if (!benchmarks.length || benchmarks.some((item) => item.peerRank < 1 || item.peerRank > item.peerSize)) throw new Error("class benchmark rank invalid");
if (!subjects.length || !knowledge.length || insights.length < 5) throw new Error("rich analysis modules are incomplete");

const reports = (['年级质量分析', '班级成绩分析', '学科质量分析', '上线与临界生'] as const).map((reportType) => buildQualityReport(dataset, { exam, track: "物理类", classNo: "全部", reportType, subject: knowledgeSubject }));
reports.forEach((report) => {
  if (report.summary.count !== rows.length || report.segments.reduce((sum, segment) => sum + segment.count, 0) !== rows.length || report.methodology.length < 6 || report.recommendations.length < 5) throw new Error(`${report.reportType} report assertions failed`);
});

console.log(JSON.stringify({ dataset: { scores: dataset.scores.length, exams: dataset.exams.length, confidence: Number((dataset.profile?.overallConfidence ?? 0).toFixed(3)) }, exam, physical: { count: rows.length, average: Number(stats.average.toFixed(1)), median: Number(stats.median.toFixed(1)), p25: Number(stats.p25.toFixed(1)), p75: Number(stats.p75.toFixed(1)), standardDeviation: Number(stats.standardDeviation.toFixed(1)), bins: bins.length, segments: segments.length, classes: benchmarks.length, subjects: subjects.length, knowledgeSubject, knowledge: knowledge.length, insights: insights.length }, reports: reports.map((report) => ({ type: report.reportType, summaryCount: report.summary.count, recommendations: report.recommendations.length, methodology: report.methodology.length })) }));
