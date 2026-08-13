"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LineChart as LineChartIcon,
  LoaderCircle,
  Medal,
  Menu,
  Printer,
  School,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  UserRoundSearch,
  UsersRound,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartGradient, PremiumLegend, PremiumTooltip, VISUAL_COLORS, axisStyle, chartGridProps } from "./components/chart-system";
import { CLASS_PROFILES, getClassProfile, relevantSubjects } from "./lib/class-config";
import { average, buildExecutiveInsights, classBenchmarks, classSummaries, criticalStudents, descriptiveStats, distributionBins, filterScores, getThreshold, knowledgeSummaries, segmentSummary, subjectSummaries } from "./lib/analytics";
import { createDemoDataset } from "./lib/demo";
import { exportAnalysisExcel, exportElementPdf, exportReportWord } from "./lib/exporters";
import { buildQualityReport } from "./lib/report-model";
import { clearStoredDatasets, deleteStoredDataset, listStoredDatasets, loadLatestDataset, loadStoredDataset, saveLatestDataset, type StoredDatasetSummary } from "./lib/storage";
import type { ClassProfile, DuplicateStrategy, GradeDataset, GradeImportOptions, StudentScore, SubjectName, Track } from "./lib/types";

type ViewId = "dashboard" | "grade" | "classes" | "subjects" | "students" | "online" | "items" | "history" | "reports" | "settings";
import type { ReportType } from "./lib/report-model";
const REPORT_TYPES: ReportType[] = ["年级质量分析", "班级成绩分析", "学科质量分析", "上线与临界生"];

type NavGroup = "总览" | "深度分析" | "报告与配置";
const navItems: Array<{ id: ViewId; label: string; description: string; icon: typeof LayoutDashboard; group: NavGroup }> = [
  { id: "dashboard", label: "考试质量总览", description: "关键结果与教学信号", icon: LayoutDashboard, group: "总览" },
  { id: "grade", label: "成绩分布", description: "年级结构与学生分层", icon: GraduationCap, group: "总览" },
  { id: "classes", label: "班级对比", description: "横向差异与转化表现", icon: UsersRound, group: "总览" },
  { id: "subjects", label: "学科诊断", description: "学科有效率与短板", icon: BarChart3, group: "深度分析" },
  { id: "students", label: "学生档案", description: "个人成绩与历史轨迹", icon: UserRoundSearch, group: "深度分析" },
  { id: "online", label: "上线与临界", description: "目标线与重点名单", icon: Target, group: "深度分析" },
  { id: "items", label: "小题与知识点", description: "失分定位与优先级", icon: BookOpenCheck, group: "深度分析" },
  { id: "history", label: "考试趋势", description: "多次考试纵向观察", icon: LineChartIcon, group: "深度分析" },
  { id: "reports", label: "报告工作室", description: "生成与导出分析报告", icon: ClipboardList, group: "报告与配置" },
  { id: "settings", label: "规则与数据", description: "分数线、班型与质检", icon: Settings, group: "报告与配置" },
];

const CHART_COLORS = { primary: VISUAL_COLORS.primary, secondary: VISUAL_COLORS.primarySoft, grid: VISUAL_COLORS.grid, cursor: VISUAL_COLORS.cursor } as const;
const SEGMENT_COLORS: Record<string, string> = { high: "#5B5BD6", top: "#7C73E6", "top-critical": "#F59E0B", undergraduate: "#10B981", "undergraduate-critical": "#34D399", foundation: "#94A3B8", unclassified: "#CBD5E1" };
const format1 = (value: number) => value.toFixed(1);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const sameStudent = (left: StudentScore, right: StudentScore) => left.identityKey && right.identityKey ? left.identityKey === right.identityKey : left.school === right.school && left.classNo === right.classNo && left.name === right.name;
const studentKey = (student: StudentScore) => student.identityKey ?? `${student.exam}::${student.school}::${student.classNo}::${student.studentId ?? student.name}::${student.sourceRow ?? "unknown"}`;
const refreshRuleDependentProfile = (dataset: GradeDataset): GradeDataset => {
  if (!dataset.profile) return dataset;
  const expected = dataset.scores.reduce((sum, row) => sum + relevantSubjects(getClassProfile(row.classNo, row.rawExam, dataset.classProfiles)).length, 0);
  const present = dataset.scores.reduce((sum, row) => sum + relevantSubjects(getClassProfile(row.classNo, row.rawExam, dataset.classProfiles)).filter((subject) => typeof row.subjects[subject] === "number").length, 0);
  const subjectCompleteness = expected ? present / expected : 0;
  const thresholdExpected = dataset.exams.reduce((sum, examName) => sum + new Set(dataset.scores.filter((row) => row.exam === examName && row.track !== "未配置").map((row) => row.track)).size, 0);
  const thresholdComplete = dataset.thresholds.filter((line) => typeof line.topTotal === "number" && typeof line.undergraduateTotal === "number").length;
  const thresholdCompleteness = thresholdExpected ? Math.min(1, thresholdComplete / thresholdExpected) : 0;
  const capabilities = dataset.profile.capabilities.map((capability) => capability.id === "subjects"
    ? { ...capability, available: subjectCompleteness > .2, confidence: subjectCompleteness, reason: `学科字段完整度${Math.round(subjectCompleteness * 100)}%` }
    : capability.id === "online"
      ? { ...capability, available: thresholdComplete > 0, confidence: thresholdCompleteness, reason: `双分数线完整度${Math.round(thresholdCompleteness * 100)}%` }
      : capability);
  return { ...dataset, profile: { ...dataset.profile, subjectCompleteness, thresholdCompleteness, capabilities } };
};
const cnDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

function StatCard({ icon: Icon, label, value, note, tone = "blue" }: { icon: typeof Target; label: string; value: string; note: string; tone?: string }) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <div className="stat-card-head"><div className="stat-icon"><Icon size={18} /></div><p>{label}</p></div>
      <strong>{value}</strong>
      <span>{note}</span>
    </article>
  );
}

function Panel({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <div className="panel-heading"><i /><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>
        {action}
      </header>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state"><BarChart3 size={34} /><p>{text}</p></div>;
}

function StatusTag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "good" | "warn" | "bad" | "neutral" | "blue" }) {
  return <span className={`status-tag ${tone}`}>{children}</span>;
}

function TierLegend() {
  return <div className="tier-legend" aria-label="一本和本科颜色说明"><span className="top"><i />一本/特控</span><span className="undergraduate"><i />本科</span></div>;
}

function ChartKey({ items }: { items: Array<{ label: string; color: string; kind?: "bar" | "line" | "dash" }> }) {
  return <div className="report-chart-legend" aria-label="图表图例">{items.map((item) => <span key={item.label}><i className={item.kind ?? "bar"} style={{ "--legend-color": item.color } as React.CSSProperties} />{item.label}</span>)}</div>;
}

type SelectMenuOption = { value: string; label: string; note?: string };

function SelectMenu({ value, options, onChange, ariaLabel, className = "" }: { value: string; options: SelectMenuOption[]; onChange: (value: string) => void; ariaLabel: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  const updatePopupPosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const preferredHeight = Math.min(280, options.length * 45 + 12);
    const openAbove = window.innerHeight - rect.bottom < preferredHeight + 14 && rect.top > preferredHeight;
    setPopupStyle({
      left: Math.max(10, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 176) - 10)),
      top: openAbove ? undefined : rect.bottom + 7,
      bottom: openAbove ? window.innerHeight - rect.top + 7 : undefined,
      width: Math.max(rect.width, 176),
      maxHeight: Math.max(120, Math.min(280, openAbove ? rect.top - 24 : window.innerHeight - rect.bottom - 24)),
    });
  };

  useEffect(() => {
    if (!open) return;
    updatePopupPosition();
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popupRef.current?.contains(target)) setOpen(false);
    };
    const closeOnResize = () => setOpen(false);
    const repositionOnScroll = () => updatePopupPosition();
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", closeOnResize);
    window.addEventListener("scroll", repositionOnScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("resize", closeOnResize);
      window.removeEventListener("scroll", repositionOnScroll, true);
    };
  }, [open, options.length]);

  const focusOption = (index: number) => {
    const buttons = popupRef.current?.querySelectorAll<HTMLButtonElement>("[role='option']");
    buttons?.[Math.max(0, Math.min(index, buttons.length - 1))]?.focus({ preventScroll: true });
  };
  const openMenu = () => {
    setOpen(true);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => focusOption(Math.max(0, options.findIndex((option) => option.value === value)))));
  };
  const handleOptionKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown") { event.preventDefault(); focusOption(index + 1); }
    if (event.key === "ArrowUp") { event.preventDefault(); focusOption(index - 1); }
    if (event.key === "Home") { event.preventDefault(); focusOption(0); }
    if (event.key === "End") { event.preventDefault(); focusOption(options.length - 1); }
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
  };

  return <div className={`select-menu ${className}`}>
    <button ref={triggerRef} type="button" className="select-menu-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => open ? setOpen(false) : openMenu()} onKeyDown={(event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); openMenu(); }
      if (event.key === "Escape") setOpen(false);
    }}><span>{selected?.label ?? value}</span><ChevronDown size={14} /></button>
    {open && typeof document !== "undefined" && createPortal(<div ref={popupRef} className="select-menu-popup" role="listbox" aria-label={ariaLabel} style={popupStyle}>
      {options.map((option, index) => <button type="button" role="option" aria-selected={option.value === value} data-option-index={index} key={option.value} onKeyDown={(event) => handleOptionKey(event, index)} onClick={() => { onChange(option.value); setOpen(false); triggerRef.current?.focus(); }}><span><b>{option.label}</b>{option.note && <small>{option.note}</small>}</span>{option.value === value && <CheckCircle2 size={15} />}</button>)}
    </div>, document.body)}
  </div>;
}

type ImportOptionsState = Required<Pick<GradeImportOptions, "includeReconstructedTotals" | "duplicateStrategy">> & { school: string | null };

function ImportReviewDialog({ dataset, options, confirming, onChange, onCancel, onConfirm }: { dataset: GradeDataset; options: ImportOptionsState; confirming: boolean; onChange: (next: ImportOptionsState) => void; onCancel: () => void; onConfirm: () => void }) {
  const review = dataset.importReview;
  const fields = dataset.profile?.fieldMatches ?? [];
  const requiredFields = fields.filter((field) => ["考试", "学校", "班级", "姓名", "总分", "语文", "数学", "英语", "物理", "历史", "化学", "生物", "政治", "地理"].includes(field.field));
  const warnings = dataset.issues.filter((issue) => issue.level === "warning" || issue.level === "error");
  if (!review) return null;
  const update = (patch: Partial<ImportOptionsState>) => onChange({ ...options, ...patch });
  return <div className="import-review-backdrop" role="presentation">
    <section className="import-review-dialog" role="dialog" aria-modal="true" aria-labelledby="import-review-title">
      <header className="import-review-header"><div><span>IMPORT REVIEW</span><h2 id="import-review-title">确认后再导入</h2><p>{dataset.sourceName}</p></div><button onClick={onCancel} aria-label="取消导入"><X /></button></header>
      <div className="import-review-body">
        <div className="import-review-summary">
          <div><span>学校</span><b>{review.selectedSchool ?? "全部学校"}</b><small>{review.detectedSchools.length}所</small></div>
          <div><span>考试</span><b>{dataset.exams.length}</b><small>{dataset.exams.slice(0, 3).join("、")}{dataset.exams.length > 3 ? "…" : ""}</small></div>
          <div><span>班级</span><b>{review.classCount}</b><small>按学校＋班级统计</small></div>
          <div><span>学生</span><b>{review.studentCount.toLocaleString()}</b><small>{review.retainedRows.toLocaleString()}条成绩</small></div>
        </div>

        <div className="import-review-grid">
          <div className="import-review-card">
            <h3>1. 数据范围</h3>
            <label className="import-review-field"><span>导入学校</span><SelectMenu className="dialog-select" ariaLabel="导入学校" value={options.school ?? review.detectedSchools[0]?.school ?? ""} onChange={(school) => update({ school })} options={review.detectedSchools.map((item) => ({ value: item.school, label: item.school, note: `${item.rowCount.toLocaleString()}行数据` }))} /></label>
            <div className="identity-notice neutral"><ShieldCheck /><p><b>{review.identityCoverage ? "身份关联：学号优先" : "身份关联：班级＋姓名"}</b><span>{review.identityCoverage ? `当前${percent(review.identityCoverage)}记录含稳定编号；其余记录仍保留源表行号。` : "学号为可选字段，不参与质量评分；系统会保留原始行号便于核对。"}</span></p></div>
          </div>

          <div className="import-review-card">
            <h3>2. 计算口径</h3>
            <label className="import-check"><input type="checkbox" checked={options.includeReconstructedTotals} disabled={!review.reconstructedTotals} onChange={(event) => update({ includeReconstructedTotals: event.target.checked })} /><span><b>纳入重构总分</b><small>{review.reconstructedTotals ? `${review.reconstructedTotals}条由至少4门有效学科相加` : "本次没有重构总分"}</small></span></label>
            <p className="import-review-note">源表总分始终优先；重构值会继续标记为“重构”，不会伪装成源表值。</p>
          </div>

          <div className="import-review-card span-2">
            <h3>3. 重复记录处理</h3>
            <div className="duplicate-options">{([{"value":"keep-last","label":"保留末行","note":"兼容当前系统结果"},{"value":"keep-first","label":"保留首行","note":"使用最早出现记录"},{"value":"keep-all","label":"全部保留","note":"不自动去重"}] as const).map((item) => <label className={options.duplicateStrategy === item.value ? "active" : ""} key={item.value}><input type="radio" name="duplicate-strategy" value={item.value} checked={options.duplicateStrategy === item.value} onChange={() => update({ duplicateStrategy: item.value as DuplicateStrategy })} /><span><b>{item.label}</b><small>{item.note}</small></span></label>)}</div>
            <div className={review.duplicateGroups ? "duplicate-warning" : "duplicate-clear"}>{review.duplicateGroups ? <AlertTriangle /> : <CheckCircle2 />}<p><b>{review.duplicateGroups ? `${review.duplicateGroups}组重复身份，多出${review.duplicateRows}行` : "未发现重复身份记录"}</b><span>{review.duplicateGroups ? `当前将${options.duplicateStrategy === "keep-all" ? "全部保留" : `去除${review.deduplicatedRows}行`}；下方仅显示源表行号，不展示学生姓名。` : "无需执行去重。"}</span></p></div>
            {review.duplicateConflicts.length > 0 && <div className="conflict-list">{review.duplicateConflicts.slice(0, 8).map((conflict, index) => <div key={`${conflict.exam}-${conflict.classNo}-${index}`}><b>{conflict.exam} · {conflict.classNo}班</b><span>源行 {conflict.rowNumbers.join(" / ")}</span><small>{conflict.conflictingFields.length ? `冲突字段：${conflict.conflictingFields.join("、")}` : "字段完全相同"}</small></div>)}{review.duplicateConflicts.length > 8 && <p>另有{review.duplicateConflicts.length - 8}组，可在导入后的“数据质检”查看行号。</p>}</div>}
          </div>

          <div className="import-review-card span-2">
            <h3>4. 字段映射</h3>
            <div className="field-map-review">{requiredFields.map((field) => <div className={field.column === null ? "missing" : field.strategy === "semantic" ? "matched" : "fallback"} key={field.field}><span>{field.field}</span><b>{field.header || "未识别"}</b><small>{field.column === null ? "—" : `${field.column + 1}列 · ${Math.round(field.confidence * 100)}%`}</small></div>)}</div>
          </div>

          <div className="import-review-card span-2">
            <h3>5. 质检结果</h3>
            <div className="review-issue-list">{warnings.length ? warnings.map((issue, index) => <div key={`${issue.code}-${index}`}><AlertTriangle /><p><b>{issue.message}</b>{issue.rowNumbers?.length ? <span>源行示例：{issue.rowNumbers.join("、")}</span> : issue.suggestion ? <span>{issue.suggestion}</span> : null}</p></div>) : <div className="clear"><CheckCircle2 /><p><b>核心数据检查通过</b><span>确认后即可进入分析。</span></p></div>}</div>
          </div>
        </div>
      </div>
      <footer className="import-review-actions"><p>确认前不会覆盖当前数据，也不会写入浏览器存储。</p><div><button className="secondary-button" onClick={onCancel} disabled={confirming}>取消</button><button className="primary-button" onClick={onConfirm} disabled={confirming}>{confirming ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />}{confirming ? "正在保存" : `确认导入 ${review.retainedRows.toLocaleString()} 条`}</button></div></footer>
    </section>
  </div>;
}

function ReportBody({ dataset, exam, track, classNo, reportType, reportId = "report-content", chartPrefix = "preview", fullDetails = false }: { dataset: GradeDataset; exam: string; track: Track | "全部"; classNo: number | "全部"; reportType: ReportType; reportId?: string; chartPrefix?: string; fullDetails?: boolean }) {
  const report = buildQualityReport(dataset, { exam, track, classNo, reportType });
  const { summary, classes, critical, subjects, segments, insights, distribution, trend } = report;
  const classChart = classes.map((item) => ({ name: `${item.classNo}班`, 一本率: Number((item.topRate * 100).toFixed(1)), 本科率: Number((item.undergraduateRate * 100).toFixed(1)) }));

  return (
    <div className="report-paper" id={reportId}>
      <div className="report-brand">质量慧析 · {dataset.school}</div>
      <h1>{exam}考试 · {reportType}报告</h1>
      <p className="report-meta">范围：{report.scope}　生成方式：系统即时生成　数据质量{report.quality.score}分 · 识别置信度{percent(report.quality.confidence)}</p>
      <div className="report-focus"><b>本报告回答什么</b><span>{report.focusStatement}</span></div>
      <div className="report-kpis">
        <div><span>参考人数</span><b>{summary.count}</b></div>
        <div><span>平均分 / 中位数</span><b>{format1(summary.average)} / {format1(summary.median)}</b></div>
        <div className="report-tier-top"><span>特控/一本上线</span><b>{summary.topCount} <small>{percent(summary.topRate)}</small></b></div>
        <div className="report-tier-undergraduate"><span>本科上线</span><b>{summary.undergraduateCount} <small>{percent(summary.undergraduateRate)}</small></b></div>
      </div>
      <div className="report-chart-grid">
        <div className="report-chart-card" data-report-chart="overview"><b>成绩分布</b><span>人数分布与中位数定位</span><ChartKey items={[{ label: "区间人数", color: VISUAL_COLORS.primary }, { label: "中位数位置", color: VISUAL_COLORS.cyanDark, kind: "dash" }]} /><div className="report-chart-canvas"><ResponsiveContainer width="100%" height="100%"><BarChart data={distribution} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}><defs><ChartGradient id={`${chartPrefix}-reportDistribution`} from="#746EF7" to="#D9D6FF" /></defs><CartesianGrid {...chartGridProps} /><XAxis dataKey="label" tick={{ ...axisStyle, fontSize: 8 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={10} tickMargin={7} /><YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} /><ReferenceLine x={distribution.find((bin) => report.stats.median >= bin.start && report.stats.median < bin.end)?.label} stroke={VISUAL_COLORS.cyanDark} strokeDasharray="4 4" /><Bar dataKey="count" fill={`url(#${chartPrefix}-reportDistribution)`} radius={[6, 6, 2, 2]} maxBarSize={34} isAnimationActive={false} /></BarChart></ResponsiveContainer></div></div>
        <div className="report-chart-card" data-report-chart="overview"><b>学生分层</b><span>横条颜色与下列分层一一对应</span><ChartKey items={segments.map((item) => ({ label: item.label, color: SEGMENT_COLORS[item.id] ?? VISUAL_COLORS.primary }))} /><div className="report-chart-canvas"><ResponsiveContainer width="100%" height="100%"><BarChart data={segments} layout="vertical" margin={{ top: 6, right: 12, left: 12, bottom: 0 }}><XAxis type="number" hide /><YAxis dataKey="label" type="category" tick={axisStyle} tickLine={false} axisLine={false} width={66} /><Bar dataKey="count" radius={[0, 7, 7, 0]} maxBarSize={12} isAnimationActive={false}>{segments.map((item) => <Cell key={item.id} fill={SEGMENT_COLORS[item.id] ?? VISUAL_COLORS.primary} />)}</Bar></BarChart></ResponsiveContainer></div></div>
        <div className="report-chart-card report-chart-wide" data-report-chart="detail"><b>班级上线率对比</b><span>同一班级的两根柱分别表示一本与本科上线率</span><ChartKey items={[{ label: "一本/特控上线率", color: VISUAL_COLORS.amber }, { label: "本科上线率", color: VISUAL_COLORS.cyan }]} /><div className="report-chart-canvas"><ResponsiveContainer width="100%" height="100%"><BarChart data={classChart} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}><CartesianGrid {...chartGridProps} /><XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} /><YAxis domain={[0, 100]} unit="%" tick={axisStyle} tickLine={false} axisLine={false} /><Bar dataKey="一本率" fill={VISUAL_COLORS.amber} radius={[5, 5, 2, 2]} maxBarSize={18} isAnimationActive={false} /><Bar dataKey="本科率" fill={VISUAL_COLORS.cyan} radius={[5, 5, 2, 2]} maxBarSize={18} isAnimationActive={false} /></BarChart></ResponsiveContainer></div></div>
        {trend.length > 1 && <div className="report-chart-card report-chart-wide" data-report-chart="detail"><b>历次考试趋势</b><span>指数100表示达到当次一本线；右轴为上线率</span><ChartKey items={[{ label: "一本线达成指数", color: VISUAL_COLORS.primary, kind: "line" }, { label: "一本上线率", color: VISUAL_COLORS.amber, kind: "line" }, { label: "本科上线率", color: VISUAL_COLORS.cyan, kind: "line" }, { label: "指数基准100", color: VISUAL_COLORS.primary, kind: "dash" }]} /><div className="report-chart-canvas"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend.map((item) => ({ ...item, topRatePercent: item.topRate * 100, undergraduateRatePercent: item.undergraduateRate * 100 }))} margin={{ top: 8, right: 22, left: 4, bottom: 0 }}><CartesianGrid {...chartGridProps} /><XAxis dataKey="exam" tick={axisStyle} tickLine={false} axisLine={false} /><YAxis yAxisId="score" width={38} tick={{ ...axisStyle, fontSize: 9 }} tickFormatter={(value) => `${Math.round(Number(value))}`} tickLine={false} axisLine={false} domain={["dataMin - 10", "dataMax + 10"]} /><YAxis yAxisId="rate" width={34} orientation="right" domain={[0, 100]} tick={{ ...axisStyle, fontSize: 9 }} tickFormatter={(value) => `${Math.round(Number(value))}%`} tickLine={false} axisLine={false} /><ReferenceLine yAxisId="score" y={100} stroke={VISUAL_COLORS.primary} strokeDasharray="4 4" /><Line yAxisId="score" type="monotone" dataKey="topLineIndex" stroke={VISUAL_COLORS.primary} strokeWidth={2.5} dot={{ r: 3, fill: "#fff" }} connectNulls isAnimationActive={false} /><Line yAxisId="rate" type="monotone" dataKey="topRatePercent" stroke={VISUAL_COLORS.amber} strokeWidth={2} dot={false} isAnimationActive={false} /><Line yAxisId="rate" type="monotone" dataKey="undergraduateRatePercent" stroke={VISUAL_COLORS.cyan} strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div></div>}
      </div>
      <h2>一、总体情况</h2>
      <p>本次纳入分析学生{summary.count}人，成绩中位数{format1(summary.median)}分，四分位区间{format1(report.stats.p25)}—{format1(report.stats.p75)}分。一本线下20分以内临界学生{summary.topCriticalCount}人，本科线下20分以内临界学生{summary.undergraduateCriticalCount}人。</p>
      <div className="report-segment-grid">{segments.map((segment) => <div key={segment.id}><i style={{ background: SEGMENT_COLORS[segment.id] }} /><b>{segment.label}</b><strong>{segment.count}人</strong><span>{percent(segment.rate)} · {segment.intent}</span></div>)}</div>
      <h2>二、证据链洞察</h2>
      <div className="report-insights">{insights.map((insight) => <div key={insight.id} className={insight.tone}><b>{insight.title}</b><span>{insight.finding}</span><small>{insight.action}</small></div>)}</div>
      <h2>三、班级表现</h2>
      <table><thead><tr><th>班级</th><th>班型</th><th>人数</th><th>平均分</th><th>一本上线</th><th>本科上线</th></tr></thead>
        <tbody>{classes.map((item) => <tr key={item.classNo}><td>{item.classNo}班</td><td>{item.type}</td><td>{item.count}</td><td>{format1(item.average)} <small className={item.averageDelta >= 0 ? "positive" : "negative"}>{item.averageDelta >= 0 ? "+" : ""}{format1(item.averageDelta)}</small></td><td>{item.topCount} / {percent(item.topRate)}</td><td>{item.undergraduateCount} / {percent(item.undergraduateRate)}</td></tr>)}</tbody>
      </table>
      <h2>四、学科诊断</h2>
      <p>{subjects.length ? `当前可比学科中，${[...subjects].sort((a, b) => b.undergraduateEffectiveRate - a.undergraduateEffectiveRate)[0]!.subject}本科有效率最高，${[...subjects].sort((a, b) => a.undergraduateEffectiveRate - b.undergraduateEffectiveRate)[0]!.subject}最低。` : "暂无有效学科分数据"}</p>
      <table><thead><tr><th>学科</th><th>参考人数</th><th>平均分</th><th>一本有效人数/率</th><th>本科有效人数/率</th></tr></thead>
        <tbody>{subjects.map((item) => <tr key={item.subject}><td>{item.subject}</td><td>{item.count}</td><td>{format1(item.average)}</td><td>{item.topEffectiveCount} / {percent(item.topEffectiveRate)}</td><td>{item.undergraduateEffectiveCount} / {percent(item.undergraduateEffectiveRate)}</td></tr>)}</tbody>
      </table>
      <h2>五、临界生关注</h2>
      <p>建议班主任与任课教师重点关注以下靠线学生，优先补强其差距最大的学科。{!fullDetails && critical.length > 20 ? ` 当前仅预览前20人，导出PDF与Word包含全部${critical.length}人。` : ""}</p>
      <table><thead><tr><th>临界类型</th><th>班级</th><th>姓名</th><th>总分</th><th>一本差</th><th>本科差</th><th>优先补强</th></tr></thead>
        <tbody>{(fullDetails ? critical : critical.slice(0, 20)).map((item) => <tr key={studentKey(item)}><td>{item.criticalTiers.join("、")}</td><td>{item.classNo}班</td><td>{item.name}</td><td>{format1(item.total)}</td><td>{item.topDiff === null ? "—" : format1(item.topDiff)}</td><td>{item.undergraduateDiff === null ? "—" : format1(item.undergraduateDiff)}</td><td>{item.weakSubjects.slice(0, 2).map((weak) => weak.subject).join("、") || "待分析"}</td></tr>)}</tbody>
      </table>
      <h2>六、数据质量与方法</h2>
      <div className="report-quality-grid"><span>质量评分 <b>{report.quality.score}分</b></span><span>身份关联 <b>{report.quality.identityCoverage ? "学号优先" : "班级＋姓名"}</b></span><span>学科完整度 <b>{percent(report.quality.subjectCompleteness)}</b></span><span>分数线完整度 <b>{percent(report.quality.thresholdCompleteness)}</b></span><span>小题覆盖度 <b>{percent(report.quality.itemCoverage)}</b></span><span>重建总分 <b>{report.quality.reconstructedTotals}</b></span></div>
      <p className="report-method-note">{report.methodology.slice(0, 3).join(" ")}</p>
      <div className="report-footer">数据来源：{dataset.sourceName} · 系统依据导入成绩重新计算</div>
    </div>
  );
}

export default function Home() {
  const [dataset, setDataset] = useState<GradeDataset>(() => createDemoDataset());
  const [view, setView] = useState<ViewId>("dashboard");
  const [exam, setExam] = useState("4册");
  const [track, setTrack] = useState<Track | "全部">("物理类");
  const [classNo, setClassNo] = useState<number | "全部">("全部");
  const [subject, setSubject] = useState<SubjectName>("语文");
  const [studentQuery, setStudentQuery] = useState("");
  const [gradePage, setGradePage] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState<StudentScore | null>(null);
  const [storageHistory, setStorageHistory] = useState<StoredDatasetSummary[]>([]);
  const [persistenceEnabled, setPersistenceEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    try { return window.localStorage.getItem("quality-insight-persistence") !== "off"; } catch { return true; }
  });
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [importDraft, setImportDraft] = useState<GradeDataset | null>(null);
  const [importOptions, setImportOptions] = useState<ImportOptionsState>({ school: null, includeReconstructedTotals: true, duplicateStrategy: "keep-last" });
  const [exporting, setExporting] = useState<"word" | "pdf" | "excel" | null>(null);
  const [reportType, setReportType] = useState<ReportType>("年级质量分析");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let persistencePreference: string | null = null;
    try { persistencePreference = window.localStorage.getItem("quality-insight-persistence"); } catch { /* Storage may be unavailable in hardened browsers. */ }
    const persistenceOff = persistencePreference === "off";
    if (!persistenceOff) loadLatestDataset().then((saved) => {
      if (saved) {
        setDataset(saved);
        setExam(saved.exams.includes("4册") ? "4册" : saved.exams.at(-1) ?? "");
      }
    }).catch(() => undefined);
    listStoredDatasets().then(setStorageHistory).catch(() => undefined);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [view]);

  useEffect(() => {
    if (!confirmingClear && !importDraft) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (confirmingClear) setConfirmingClear(false);
      else if (!confirmingImport) setImportDraft(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [confirmingClear, importDraft, confirmingImport]);

  const activeScores = useMemo(() => filterScores(dataset, exam, track, classNo), [dataset, exam, track, classNo]);
  const allClassSummaries = useMemo(() => classSummaries(dataset, exam, track), [dataset, exam, track]);
  const currentClassSummaries = useMemo(() => allClassSummaries.filter((item) => classNo === "全部" || item.classNo === classNo), [allClassSummaries, classNo]);
  const subjects = useMemo(() => subjectSummaries(dataset, exam, track, classNo), [dataset, exam, track, classNo]);
  const activeSubject = subjects.some((item) => item.subject === subject) ? subject : subjects[0]?.subject ?? subject;
  const critical = useMemo(() => criticalStudents(dataset, exam, track, classNo), [dataset, exam, track, classNo]);
  const topCritical = useMemo(() => critical.filter((item) => item.criticalTiers.includes("一本")), [critical]);
  const undergraduateCritical = useMemo(() => critical.filter((item) => item.criticalTiers.includes("本科")), [critical]);
  const scoreStats = useMemo(() => descriptiveStats(activeScores.map((row) => row.total)), [activeScores]);
  const scoreDistribution = useMemo(() => distributionBins(activeScores.map((row) => row.total), 50), [activeScores]);
  const scoreSegments = useMemo(() => segmentSummary(dataset, exam, track, classNo), [dataset, exam, track, classNo]);
  const benchmarkRows = useMemo(() => classBenchmarks(dataset, exam, track), [dataset, exam, track]);
  const executiveInsights = useMemo(() => buildExecutiveInsights(dataset, exam, track, classNo), [dataset, exam, track, classNo]);
  const knowledgeData = useMemo(() => knowledgeSummaries(dataset, exam, activeSubject, track, classNo), [dataset, exam, activeSubject, track, classNo]);
  const gradeAverage = average(activeScores.map((row) => row.total));
  const topCount = activeScores.filter((row) => {
    const line = getThreshold(dataset, exam, row.track)?.topTotal;
    return typeof line === "number" && row.total >= line;
  }).length;
  const undergraduateCount = activeScores.filter((row) => {
    const line = getThreshold(dataset, exam, row.track)?.undergraduateTotal;
    return typeof line === "number" && row.total >= line;
  }).length;
  const expectedSubjectCells = activeScores.reduce((sum, row) => sum + relevantSubjects(getClassProfile(row.classNo, row.rawExam, dataset.classProfiles)).length, 0);
  const presentSubjectCells = activeScores.reduce((sum, row) => sum + relevantSubjects(getClassProfile(row.classNo, row.rawExam, dataset.classProfiles)).filter((item) => typeof row.subjects[item] === "number").length, 0);
  const subjectCompleteness = expectedSubjectCells ? presentSubjectCells / expectedSubjectCells : 0;
  const activeTracks = [...new Set(activeScores.map((row) => row.track))];
  const completeThresholdTracks = activeTracks.filter((item) => {
    const line = getThreshold(dataset, exam, item);
    return typeof line?.topTotal === "number" && typeof line?.undergraduateTotal === "number";
  }).length;
  const thresholdCompleteness = activeTracks.length ? completeThresholdTracks / activeTracks.length : 0;
  const datasetIssues = dataset.issues ?? [];
  const scoringIssues = datasetIssues.filter((item) => item.code !== "missing-student-id");
  const warningCount = scoringIssues.filter((item) => item.level === "warning" || item.level === "error").length;
  const identityCoverage = dataset.importReview?.identityCoverage ?? (dataset.scores.length ? dataset.scores.filter((row) => row.studentId).length / dataset.scores.length : 0);
  const profileConfidence = dataset.profile?.overallConfidence ?? 0;
  const issuePenalty = Math.min(12, scoringIssues.filter((item) => item.level === "error").length * 6 + scoringIssues.filter((item) => item.level === "warning").length * 2);
  const dataQualityScore = activeScores.length ? Math.max(0, Math.round(subjectCompleteness * 40 + thresholdCompleteness * 25 + profileConfidence * 35 - issuePenalty)) : 0;
  const classOptions = [...new Set(dataset.scores.filter((row) => row.exam === exam && (track === "全部" || row.track === track)).map((row) => row.classNo))].sort((a, b) => a - b);
  const normalizedStudentQuery = studentQuery.trim().toLocaleLowerCase("zh-CN");
  const searchedStudents = useMemo(() => [...activeScores]
    .filter((row) => !normalizedStudentQuery || [row.name, row.studentId, String(row.classNo)].some((value) => value?.toLocaleLowerCase("zh-CN").includes(normalizedStudentQuery)))
    .sort((a, b) => b.total - a.total), [activeScores, normalizedStudentQuery]);
  const gradePageSize = 50;
  const gradePageCount = Math.max(1, Math.ceil(searchedStudents.length / gradePageSize));
  const safeGradePage = Math.min(gradePage, gradePageCount);
  const gradePageRows = searchedStudents.slice((safeGradePage - 1) * gradePageSize, safeGradePage * gradePageSize);

  const historyData = useMemo(() => dataset.exams.map((examName) => {
    const rows = filterScores(dataset, examName, track, classNo);
    const comparableRows = rows.map((row) => ({ row, line: getThreshold(dataset, examName, row.track)?.topTotal })).filter((item): item is { row: StudentScore; line: number } => typeof item.line === "number" && item.line > 0);
    const top = rows.filter((row) => {
      const line = getThreshold(dataset, examName, row.track)?.topTotal;
      return typeof line === "number" && row.total >= line;
    }).length;
    const undergraduate = rows.filter((row) => {
      const line = getThreshold(dataset, examName, row.track)?.undergraduateTotal;
      return typeof line === "number" && row.total >= line;
    }).length;
    return {
      exam: examName,
      count: rows.length,
      average: Number(average(rows.map((row) => row.total)).toFixed(1)),
      topLineIndex: comparableRows.length ? Number(average(comparableRows.map(({ row, line }) => row.total / line * 100)).toFixed(1)) : null,
      top,
      topRate: rows.length ? Number((top / rows.length * 100).toFixed(1)) : 0,
      undergraduate,
      undergraduateRate: rows.length ? Number((undergraduate / rows.length * 100).toFixed(1)) : 0,
    };
  }).filter((item) => item.count > 0), [dataset, track, classNo]);

  const itemSourceSubject: SubjectName = activeSubject === "日语"
    ? "英语"
    : activeSubject === "地理" && (classNo === 9 || (classNo === "全部" && track === "物理类"))
      ? "生物"
      : activeSubject;
  const itemKey = `${itemSourceSubject}::${exam}`;
  const questionBank = (dataset.questionBanks ?? {})[itemKey] ?? [];
  const itemRows = (dataset.itemResponses ?? []).filter((row) => row.subject === activeSubject && row.exam === exam && (classNo === "全部" || row.classNo === classNo));
  const itemStats = itemRows.length ? questionBank.map((question, index) => {
    const values = itemRows.map((row) => row.scores[index]).filter((value): value is number => typeof value === "number");
    const avg = average(values);
    return { question: question.question, knowledge: question.knowledge || "未标注", maxScore: question.maxScore, maxScoreSource: question.maxScoreSource, average: avg, rate: question.maxScore ? avg / question.maxScore : 0 };
  }) : [];

  async function handleImport(file?: File) {
    if (!file) return;
    setImporting(true);
    setImportMessage(null);
    try {
      const { parseGradeWorkbook } = await import("./lib/parser");
      const parsed = await parseGradeWorkbook(file, { classProfiles: dataset.classProfiles ?? CLASS_PROFILES });
      const selectedSchool = parsed.importReview?.selectedSchool ?? parsed.school;
      setImportOptions({ school: selectedSchool === "多校数据" ? null : selectedSchool, includeReconstructedTotals: true, duplicateStrategy: "keep-last" });
      setImportDraft(parsed);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "导入失败，请检查工作簿格式。" );
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function updateImportOptions(next: ImportOptionsState) {
    if (!importDraft) return;
    setImportOptions(next);
    import("./lib/parser").then(({ configureGradeImport }) => setImportDraft((current) => current ? configureGradeImport(current, next) : current)).catch(() => setImportMessage("导入设置更新失败，请重新选择工作簿。"));
  }

  async function confirmImport() {
    if (!importDraft) return;
    setConfirmingImport(true);
    const { finalizeGradeImport } = await import("./lib/parser");
    const parsed = finalizeGradeImport(importDraft);
    setDataset(parsed);
    const defaultExam = parsed.exams.includes("4册") ? "4册" : parsed.exams.at(-1) ?? "";
    setExam(defaultExam);
    setTrack("物理类");
    setClassNo("全部");
    setSelectedStudent(null);
    let storageNote = "";
    if (persistenceEnabled) {
      try {
        await saveLatestDataset(parsed);
        setStorageHistory(await listStoredDatasets());
      } catch {
        storageNote = " 但浏览器未能永久保存，本次打开期间仍可继续分析。";
      }
    } else {
      storageNote = " 当前为不保存模式，关闭网页后不会保留本次数据。";
    }
    const parsedWarningCount = parsed.issues.filter((item) => item.level === "warning" || item.level === "error").length;
    setImportMessage(`导入完成：纳入${parsed.scores.length.toLocaleString()}条成绩、${parsed.exams.length}次考试${parsedWarningCount ? `，有${parsedWarningCount}项数据提醒可在“规则与班型”查看` : "，数据检查通过"}。${storageNote}`);
    setImportDraft(null);
    setConfirmingImport(false);
  }

  async function togglePersistence(enabled: boolean) {
    setPersistenceEnabled(enabled);
    try { window.localStorage.setItem("quality-insight-persistence", enabled ? "on" : "off"); } catch { setImportMessage("浏览器阻止了存储偏好写入，本次页面会话仍按当前选择运行。"); }
    if (enabled && dataset.id !== "demo") {
      await saveLatestDataset(dataset);
      setStorageHistory(await listStoredDatasets());
      setImportMessage("已开启本机保存，并保存当前数据版本。");
    } else if (!enabled) {
      setImportMessage("已关闭后续自动保存；现有历史版本不会自动删除。可使用“一键清空”立即移除。");
    }
  }

  async function restoreDatasetVersion(key: string) {
    const saved = await loadStoredDataset(key);
    if (!saved) return setImportMessage("历史版本已不存在，可能已被清理。");
    setDataset(saved);
    setExam(saved.exams.includes("4册") ? "4册" : saved.exams.at(-1) ?? "");
    setTrack("物理类");
    setClassNo("全部");
    setSelectedStudent(null);
    setImportMessage(`已恢复 ${cnDate(saved.importedAt)} 的本机数据版本。`);
  }

  async function removeDatasetVersion(key: string) {
    await deleteStoredDataset(key);
    setStorageHistory(await listStoredDatasets());
    setImportMessage("该历史版本已从本机删除。");
  }

  async function clearAllLocalData() {
    await clearStoredDatasets();
    setStorageHistory([]);
    setDataset(createDemoDataset());
    setExam("4册");
    setTrack("物理类");
    setClassNo("全部");
    setSelectedStudent(null);
    setConfirmingClear(false);
    setImportMessage("本机保存的成绩与历史版本已全部清空，当前已切换为虚拟示例数据。");
  }

  function updateClassRule(classNo: number, patch: Partial<ClassProfile>) {
    setDataset((current) => {
      const currentProfile = getClassProfile(classNo, "", current.classProfiles);
      const nextProfile: ClassProfile = { ...currentProfile, ...patch, classNo };
      nextProfile.label = `${classNo}班 · ${nextProfile.combination}${nextProfile.type}`;
      const classProfiles = { ...(current.classProfiles ?? CLASS_PROFILES), [classNo]: nextProfile };
      const scores = current.scores.map((row) => row.classNo === classNo ? { ...row, track: nextProfile.track, classType: nextProfile.type, combination: nextProfile.combination } : row);
      return refreshRuleDependentProfile({ ...current, classProfiles, scores });
    });
  }

  function updateSubjectSourceRule(classNo: number, value: "none" | "english-japanese" | "biology-geography") {
    const patch: Partial<ClassProfile> = value === "english-japanese"
      ? { language: "日语", subjectSourceOverrides: { 日语: "英语" } }
      : value === "biology-geography"
        ? { subjectSourceOverrides: { 地理: "生物" } }
        : { language: "英语", subjectSourceOverrides: {} };
    updateClassRule(classNo, patch);
  }

  function updateThresholdValue(lineTrack: Track, field: "topTotal" | "undergraduateTotal", raw: string) {
    const value = raw.trim() === "" ? null : Number(raw);
    if (value !== null && !Number.isFinite(value)) return;
    setDataset((current) => {
      const exists = current.thresholds.some((item) => item.exam === exam && item.track === lineTrack);
      const thresholds = exists
        ? current.thresholds.map((item) => item.exam === exam && item.track === lineTrack ? { ...item, [field]: value } : item)
        : [...current.thresholds, { exam, track: lineTrack, topTotal: field === "topTotal" ? value : null, undergraduateTotal: field === "undergraduateTotal" ? value : null, topSubjects: {}, undergraduateSubjects: {} }];
      return refreshRuleDependentProfile({ ...current, thresholds });
    });
  }

  async function saveRulesAndData() {
    if (!persistenceEnabled) {
      setImportMessage("规则已在当前页面生效；当前为不保存模式，关闭网页后不会保留修改。");
      return;
    }
    try {
      await saveLatestDataset(dataset);
      setStorageHistory(await listStoredDatasets());
      setImportMessage("班级、选科和分数线规则已保存为新的本机版本，后续导入会继续复用。 ");
    } catch {
      setImportMessage("规则已在当前页面生效，但浏览器未能保存，请检查本机存储权限。");
    }
  }

  function resetClassRules() {
    setDataset((current) => refreshRuleDependentProfile({
      ...current,
      classProfiles: CLASS_PROFILES,
      scores: current.scores.map((row) => {
        const profile = getClassProfile(row.classNo, row.rawExam, CLASS_PROFILES);
        return { ...row, track: profile.track, classType: profile.type, combination: profile.combination };
      }),
    }));
    setClassNo("全部");
    setImportMessage("班级规则已恢复为项目预置值；点击“保存规则”后写入本机历史。 ");
  }

  // Kept as a compatibility fallback for environments without the report model.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function exportWordLegacy() {
    setExporting("word");
    try {
      const { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun, WidthType } = await import("docx");
      const rows = filterScores(dataset, exam, track, classNo);
      const criticalRows = criticalStudents(dataset, exam, track, classNo);
      const topCriticalRows = criticalRows.filter((item) => item.criticalTiers.includes("一本"));
      const undergraduateCriticalRows = criticalRows.filter((item) => item.criticalTiers.includes("本科"));
      const classes = currentClassSummaries;
      const subjectRows = subjectSummaries(dataset, exam, track, classNo);
      const doc = new Document({
      styles: { default: { document: { run: { font: "Microsoft YaHei", size: 21 } } } },
      sections: [{
        children: [
          new Paragraph({ text: `${exam}考试 · ${reportType}报告`, heading: HeadingLevel.TITLE }),
          new Paragraph({ children: [new TextRun(`范围：${track}${classNo === "全部" ? " · 全部班级" : ` · ${classNo}班`}　数据来源：${dataset.sourceName}`)] }),
          new Paragraph({ text: "一、总体情况", heading: HeadingLevel.HEADING_1 }),
          new Paragraph(`参考${rows.length}人，平均分${format1(average(rows.map((row) => row.total)))}分，特控/一本上线${topCount}人，本科上线${undergraduateCount}人；一本临界生${topCriticalRows.length}人，本科临界生${undergraduateCriticalRows.length}人。`),
          new Paragraph({ text: "二、班级表现", heading: HeadingLevel.HEADING_1 }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
            new TableRow({ children: ["班级", "班型", "人数", "平均分", "一本上线", "本科上线"].map((value) => new TableCell({ children: [new Paragraph(value)] })) }),
            ...classes.map((item) => new TableRow({ children: [`${item.classNo}班`, item.type, String(item.count), format1(item.average), String(item.topCount), String(item.undergraduateCount)].map((value) => new TableCell({ children: [new Paragraph(value)] })) })),
          ] }),
          new Paragraph({ text: "三、学科有效上线", heading: HeadingLevel.HEADING_1 }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
            new TableRow({ children: ["学科", "平均分", "一本有效人数/率", "本科有效人数/率"].map((value) => new TableCell({ children: [new Paragraph(value)] })) }),
            ...subjectRows.map((item) => new TableRow({ children: [item.subject, format1(item.average), `${item.topEffectiveCount} / ${percent(item.topEffectiveRate)}`, `${item.undergraduateEffectiveCount} / ${percent(item.undergraduateEffectiveRate)}`].map((value) => new TableCell({ children: [new Paragraph(value)] })) })),
          ] }),
          new Paragraph({ text: "四、临界生名单", heading: HeadingLevel.HEADING_1 }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
            new TableRow({ children: ["临界类型", "班级", "姓名", "总分", "一本差", "本科差", "优先补强"].map((value) => new TableCell({ children: [new Paragraph(value)] })) }),
            ...criticalRows.slice(0, 40).map((item) => new TableRow({ children: [item.criticalTiers.join("、"), `${item.classNo}班`, item.name, format1(item.total), item.topDiff === null ? "—" : format1(item.topDiff), item.undergraduateDiff === null ? "—" : format1(item.undergraduateDiff), item.weakSubjects.slice(0, 2).map((weak) => weak.subject).join("、")].map((value) => new TableCell({ children: [new Paragraph(value)] })) })),
          ] }),
        ],
      }],
    });
      const blob = await Packer.toBlob(doc);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${exam}-${classNo === "全部" ? track : `${classNo}班`}-${reportType}.docx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      setImportMessage("Word报告已生成并开始下载。");
    } catch (error) {
      setImportMessage(error instanceof Error ? `Word导出失败：${error.message}` : "Word导出失败，请重试。");
    } finally {
      setExporting(null);
    }
  }

  // Kept as a compatibility fallback for environments without the report model.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function exportPdfLegacy() {
    setExporting("pdf");
    try {
      await document.fonts.ready;
      const target = document.getElementById("export-report-content");
      if (!target) throw new Error("未找到报告内容");
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const canvas = await html2canvas(target, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 7;
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = pageHeight - margin * 2;
      const maxSlicePixels = contentHeight * canvas.width / contentWidth;
      const targetRect = target.getBoundingClientRect();
      const canvasScale = canvas.width / targetRect.width;
      const protectedRanges = Array.from(target.querySelectorAll("h1, h2, p, tr, .report-kpis, .report-footer")).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          top: Math.max(0, (rect.top - targetRect.top) * canvasScale),
          bottom: Math.min(canvas.height, (rect.bottom - targetRect.top) * canvasScale),
        };
      });
      const compactToSinglePage = canvas.height > maxSlicePixels && canvas.height <= maxSlicePixels * 1.12;
      if (compactToSinglePage) {
        const naturalHeightMm = canvas.height * contentWidth / canvas.width;
        const scale = contentHeight / naturalHeightMm;
        const compactWidth = contentWidth * scale;
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", (pageWidth - compactWidth) / 2, margin, compactWidth, contentHeight, undefined, "FAST");
      }
      let sliceStart = 0;
      let pageIndex = 0;
      while (!compactToSinglePage && sliceStart < canvas.height - 2) {
        const desiredEnd = Math.min(canvas.height, sliceStart + maxSlicePixels);
        let sliceEnd = desiredEnd;
        if (desiredEnd < canvas.height) {
          const crossing = protectedRanges.find((range) => range.top < desiredEnd && range.bottom > desiredEnd && range.top > sliceStart + maxSlicePixels * 0.45);
          if (crossing) sliceEnd = crossing.top;
        }
        if (sliceEnd <= sliceStart + 20) sliceEnd = desiredEnd;
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.ceil(sliceEnd - sliceStart);
        const context = sliceCanvas.getContext("2d");
        if (!context) throw new Error("无法创建PDF分页画布");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        context.drawImage(canvas, 0, sliceStart, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
        if (pageIndex > 0) pdf.addPage();
        const sliceHeightMm = sliceCanvas.height * contentWidth / sliceCanvas.width;
        pdf.addImage(sliceCanvas.toDataURL("image/jpeg", 0.94), "JPEG", margin, margin, contentWidth, sliceHeightMm, undefined, "FAST");
        sliceStart = sliceEnd;
        pageIndex += 1;
      }
      pdf.save(`${exam}-${classNo === "全部" ? track : `${classNo}班`}-${reportType}.pdf`);
      setImportMessage("PDF报告已生成并开始下载。");
    } catch (error) {
      setImportMessage(error instanceof Error ? `PDF导出失败：${error.message}` : "PDF导出失败，请重试。");
    } finally {
      setExporting(null);
    }
  }

  async function exportWord() {
    setExporting("word");
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const report = buildQualityReport(dataset, { exam, track, classNo, reportType, subject: activeSubject });
      await document.fonts?.ready;
      const target = document.getElementById("export-report-content");
      let charts: { overview?: string; detail?: string } = {};
      if (target) {
        const { default: html2canvas } = await import("html2canvas");
        const capture = async (selector: string) => {
          const elements = Array.from(target.querySelectorAll<HTMLElement>(selector));
          if (!elements.length) return undefined;
          const bounds = elements.reduce((result, element) => { const rect = element.getBoundingClientRect(); return { left: Math.min(result.left, rect.left), top: Math.min(result.top, rect.top), right: Math.max(result.right, rect.right), bottom: Math.max(result.bottom, rect.bottom) }; }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
          const rect = target.getBoundingClientRect();
          const canvas = await html2canvas(target, { scale: 1.7, backgroundColor: "#ffffff", useCORS: true, logging: false, x: bounds.left - rect.left - 4, y: bounds.top - rect.top - 4, width: bounds.right - bounds.left + 8, height: bounds.bottom - bounds.top + 8 });
          return canvas.toDataURL("image/png");
        };
        charts = { overview: await capture('[data-report-chart="overview"]'), detail: await capture('[data-report-chart="detail"]') };
      }
      await exportReportWord(report, charts);
      setImportMessage("详细Word报告已生成并开始下载。");
    } catch (error) {
      setImportMessage(error instanceof Error ? `Word导出失败：${error.message}` : "Word导出失败，请重试。");
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    setExporting("pdf");
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await document.fonts?.ready;
      await exportElementPdf(document.getElementById("export-report-content"), `质量慧析-${exam}-${reportType}.pdf`);
      setImportMessage("分页PDF报告已生成并开始下载。");
    } catch (error) {
      setImportMessage(error instanceof Error ? `PDF导出失败：${error.message}` : "PDF导出失败，请重试。");
    } finally {
      setExporting(null);
    }
  }

  async function exportExcel() {
    setExporting("excel");
    try {
      const report = buildQualityReport(dataset, { exam, track, classNo, reportType, subject: activeSubject });
      await exportAnalysisExcel(report);
      setImportMessage("多工作表Excel分析包已生成并开始下载。");
    } catch (error) {
      setImportMessage(error instanceof Error ? `Excel导出失败：${error.message}` : "Excel导出失败，请重试。");
    } finally {
      setExporting(null);
    }
  }

  const renderDashboard = () => {
    const rankData = [...currentClassSummaries].sort((a, b) => b.undergraduateRate - a.undergraduateRate).map((item) => ({ name: `${item.classNo}班`, 平均分: Number(item.average.toFixed(1)), 一本率: Number((item.topRate * 100).toFixed(1)), 本科率: Number((item.undergraduateRate * 100).toFixed(1)) }));
    const pieData = [{ name: "一本上线", value: topCount }, { name: "本科上线（未一本）", value: Math.max(0, undergraduateCount - topCount) }, { name: "本科线下", value: Math.max(0, activeScores.length - undergraduateCount) }];
    const bestConversionClass = [...currentClassSummaries].sort((a, b) => b.undergraduateRate - a.undergraduateRate)[0];
    return <>
      <div className="hero-strip">
        <div className="hero-copy"><span className="eyebrow"><i /> QUALITY OVERVIEW · {exam}</span><h1>一次考试，<br /><em>看见下一步教学行动。</em></h1><p>{track} · {classNo === "全部" ? "全年级" : `${classNo}班`}。从成绩结构、班级差异到临界学生，把分散数据整理为可以验证、可以下钻的质量结论。</p><div className="hero-meta"><span><ShieldCheck size={14} />数据仅在本机处理</span><span><Sparkles size={14} />所有指标实时重算</span></div></div>
        <div className="hero-insight">
          <div className="hero-insight-head"><span>CURRENT SIGNAL</span><i>实时更新</i></div>
          <div className="hero-insight-row top"><span>特控 / 一本</span><b>{topCount}</b><small>{percent(activeScores.length ? topCount / activeScores.length : 0)}</small></div>
          <div className="hero-insight-row undergraduate"><span>本科上线</span><b>{undergraduateCount}</b><small>{percent(activeScores.length ? undergraduateCount / activeScores.length : 0)}</small></div>
          <button className="primary-button" onClick={() => fileRef.current?.click()}><Upload size={17} />导入新数据<ArrowUpRight size={16} /></button>
        </div>
      </div>
      <div className="stat-grid">
        <StatCard icon={UsersRound} label="参考人数" value={activeScores.length.toLocaleString()} note={`${currentClassSummaries.length}个班级纳入分析`} />
        <StatCard icon={Medal} label="年级平均分" value={format1(gradeAverage)} note={`最高分${activeScores.length ? format1(Math.max(...activeScores.map((row) => row.total))) : "—"}`} tone="teal" />
        <StatCard icon={Target} label="特控/一本上线" value={`${topCount}人`} note={`上线率${percent(activeScores.length ? topCount / activeScores.length : 0)}`} tone="orange" />
        <StatCard icon={CheckCircle2} label="本科上线" value={`${undergraduateCount}人`} note={`一本临界${topCritical.length}人 · 本科临界${undergraduateCritical.length}人`} tone="green" />
      </div>
      <div className={`quality-strip ${dataQualityScore >= 90 && !warningCount ? "is-good" : "has-warning"}`}>
        <div className={`quality-score ${dataQualityScore >= 90 ? "good" : dataQualityScore >= 75 ? "warn" : "bad"}`} style={{ "--quality": `${dataQualityScore * 3.6}deg` } as React.CSSProperties} aria-label={`数据质量评分 ${dataQualityScore} 分`}><b>{dataQualityScore}</b></div>
        <div><span>数据质量与容错状态</span><strong>{dataQualityScore >= 90 ? warningCount ? `${warningCount}项提醒，核心分析仍可使用` : "数据结构完整，可放心分析" : `质量评分${dataQualityScore}分，引用结论前建议查看质检`}</strong><small>识别置信度{percent(profileConfidence)} · 身份按{identityCoverage ? "学号优先" : "班级＋姓名"}关联 · 学科{percent(subjectCompleteness)} · 分数线{percent(thresholdCompleteness)}</small></div>
        <button onClick={() => setView("settings")}>查看数据质检<ArrowUpRight size={15} /></button>
      </div>
      <div className="dashboard-analytics-ribbon">
        <Panel title="成绩分布光谱" subtitle={`中位数 ${format1(scoreStats.median)} · 四分位区间 ${format1(scoreStats.p25)}—${format1(scoreStats.p75)}`} className="distribution-panel">
          {scoreDistribution.length ? <div className="distribution-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={scoreDistribution} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}><defs><ChartGradient id="distributionFill" from="#817BFA" to="#D8D6FF" /></defs><CartesianGrid {...chartGridProps} /><XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={10} tickMargin={8} /><YAxis allowDecimals={false} tick={axisStyle} tickLine={false} axisLine={false} /><Tooltip content={<PremiumTooltip units={{ 人数: " 人" }} />} cursor={{ fill: CHART_COLORS.cursor }} /><ReferenceLine x={scoreDistribution.find((bin) => scoreStats.median >= bin.start && scoreStats.median < bin.end)?.label} stroke={VISUAL_COLORS.primaryDark} strokeDasharray="4 5" label={{ value: "中位数", fill: VISUAL_COLORS.primaryDark, fontSize: 9, position: "insideTopRight" }} /><Bar dataKey="count" name="人数" fill="url(#distributionFill)" radius={[9, 9, 3, 3]} maxBarSize={46} animationDuration={900} /></BarChart></ResponsiveContainer></div> : <EmptyState text="当前筛选范围没有可绘制的分数" />}
          <div className="stat-ribbon"><span>标准差 <b>{format1(scoreStats.standardDeviation)}</b></span><span>最高分 <b>{format1(scoreStats.max)}</b></span><span>最低分 <b>{format1(scoreStats.min)}</b></span></div>
        </Panel>
        <Panel title="学生分层行动栈" subtitle="先看人数，再决定教学资源投放">
          <div className="segment-stack">{scoreSegments.map((segment) => <div key={segment.id}><div className="segment-stack-head"><b>{segment.label}</b><span>{segment.count}人 · {percent(segment.rate)}</span></div><div className="segment-track"><i style={{ width: `${Math.max(2, segment.rate * 100)}%`, background: SEGMENT_COLORS[segment.id] }} /></div><small>{segment.intent}</small></div>)}</div>
        </Panel>
      </div>
      <Panel title="证据驱动的智能洞察" subtitle="每条结论都能回到分布、分层、学科和班级数据" className="span-2 decision-panel">
        <div className="decision-feed">{executiveInsights.map((insight) => <article key={insight.id} className={`decision-card ${insight.tone}`}><span className="decision-dot" /><div><b>{insight.title}</b><p>{insight.finding}</p><small>{insight.action}</small></div></article>)}</div>
      </Panel>
      <div className="dashboard-grid">
        <Panel title="班级一本 / 本科上线率" subtitle="橙色为一本，绿色为本科；同组柱可直接比较转化空间" action={<TierLegend />} className="span-2">
          {rankData.length ? <div className="chart-box"><ResponsiveContainer width="100%" height="100%"><BarChart data={rankData} margin={{ top: 12, right: 12, left: -10, bottom: 4 }} barGap={4}><defs><ChartGradient id="topRateFill" from="#F7BA54" to="#FCE6B5" /><ChartGradient id="underRateFill" from="#2BC7BC" to="#BCEFEA" /></defs><CartesianGrid {...chartGridProps} /><XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} /><YAxis tick={axisStyle} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} /><Tooltip content={<PremiumTooltip units={{ 一本率: "%", 本科率: "%" }} />} cursor={{ fill: CHART_COLORS.cursor }} /><Legend content={<PremiumLegend />} /><Bar dataKey="一本率" fill="url(#topRateFill)" radius={[7, 7, 2, 2]} maxBarSize={24} animationDuration={900} /><Bar dataKey="本科率" fill="url(#underRateFill)" radius={[7, 7, 2, 2]} maxBarSize={24} animationDuration={1100} /></BarChart></ResponsiveContainer></div> : <EmptyState text="当前筛选范围没有班级数据" />}
        </Panel>
        <Panel title="上线结构" subtitle="按当前分数线自动计算">
          <div className="pie-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={86} cornerRadius={8} paddingAngle={4} stroke="none" animationDuration={1000}>{pieData.map((_, index) => <Cell key={index} fill={[VISUAL_COLORS.amber, VISUAL_COLORS.cyan, "#E6E6EC"][index]} />)}</Pie><Tooltip content={<PremiumTooltip units={{ 一本上线: " 人", "本科上线（未一本）": " 人", 本科线下: " 人" }} />} /><Legend content={<PremiumLegend />} verticalAlign="bottom" /></PieChart></ResponsiveContainer><div className="pie-center"><b>{activeScores.length}</b><span>总人数</span></div></div>
        </Panel>
        <Panel title="学科有效上线" subtitle="一本 / 本科双口径">
          <div className="subject-list">{subjects.slice(0, 8).map((item) => <button key={item.subject} onClick={() => { setSubject(item.subject); setView("subjects"); }}><span>{item.subject}</span><div className="dual-progress"><i className="top" style={{ width: `${Math.min(100, item.topEffectiveRate * 100)}%` }} /><i className="undergraduate" style={{ width: `${Math.min(100, item.undergraduateEffectiveRate * 100)}%` }} /></div><b><em>一本{percent(item.topEffectiveRate)}</em><em>本科{percent(item.undergraduateEffectiveRate)}</em></b></button>)}</div>
        </Panel>
        <Panel title="本次考试智能洞察" subtitle="根据当前筛选范围实时生成" className="span-2">
          <div className="insight-cards"><div><TrendingUp /><p><b>上线转化空间</b><span>本科上线比一本上线多{Math.max(0, undergraduateCount - topCount)}人，可重点跟踪一本临界生。</span></p></div><div><Sparkles /><p><b>班级亮点</b><span>{bestConversionClass ? `${bestConversionClass.classNo}班本科上线率${percent(bestConversionClass.undergraduateRate)}，当前范围表现较优。` : "暂无班级数据"}</span></p></div><div><ShieldCheck /><p><b>数据可信度</b><span>{dataQualityScore >= 95 ? "核心字段完整，分析结果可信度较高。" : "部分字段缺失，系统已按模块降级并保留有效结论。"}</span></p></div></div>
        </Panel>
        <Panel title="临界生预警" subtitle="总分线下20分以内" action={<button className="text-button" onClick={() => setView("online")}>查看全部</button>} className="span-2">
          <div className="compact-table"><table><thead><tr><th>类型</th><th>班级</th><th>姓名</th><th>总分</th><th>一本差</th><th>本科差</th><th>优先补强</th></tr></thead><tbody>{critical.slice(0, 8).map((item) => <tr key={studentKey(item)}><td>{item.criticalTiers.join("、")}</td><td>{item.classNo}班</td><td>{item.name}</td><td>{format1(item.total)}</td><td className={(item.topDiff ?? 0) < 0 ? "negative" : "positive"}>{item.topDiff === null ? "—" : format1(item.topDiff)}</td><td>{item.undergraduateDiff === null ? "—" : format1(item.undergraduateDiff)}</td><td>{item.weakSubjects.slice(0, 2).map((weak) => weak.subject).join("、") || "待分析"}</td></tr>)}</tbody></table></div>
        </Panel>
      </div>
    </>;
  };

  const renderGrade = () => <Panel title="年级总成绩表" subtitle={`共${activeScores.length}名学生，可按总分、市排名、校排名查看`} action={<StatusTag tone="blue">{track}</StatusTag>}>
    <div className="grade-stat-grid"><div><span>平均分</span><b>{format1(scoreStats.average)}</b><small>中位数 {format1(scoreStats.median)}</small></div><div><span>四分位区间</span><b>{format1(scoreStats.p25)}—{format1(scoreStats.p75)}</b><small>标准差 {format1(scoreStats.standardDeviation)}</small></div><div><span>一本临界</span><b>{topCritical.length}</b><small>本科临界 {undergraduateCritical.length}</small></div><div><span>数据置信度</span><b>{percent(dataset.profile?.overallConfidence ?? 0)}</b><small>缺失学科不按0分</small></div></div>
    <div className="segment-overview">{scoreSegments.map((segment) => <div key={segment.id}><i style={{ background: SEGMENT_COLORS[segment.id] }} /><span>{segment.label}</span><b>{segment.count}</b><small>{percent(segment.rate)}</small></div>)}</div>
    <div className="table-toolbar"><div className="search-box"><Search size={16} /><input value={studentQuery} onChange={(event) => { setStudentQuery(event.target.value); setGradePage(1); }} placeholder="搜索姓名、学号或班级" aria-label="搜索姓名、学号或班级" /></div><span>已按总分排序 · 匹配{searchedStudents.length}人 · 每页{gradePageSize}条</span></div>
    <div className="data-table"><table><thead><tr><th>校名</th><th>班级</th><th>姓名</th><th>班型</th><th>组合</th><th>总分</th><th>一本差</th><th>本科差</th><th>市排名</th><th>校排名</th>{["语文", "数学", "英语", "日语", "物理", "历史", "化学", "生物", "政治", "地理"].map((item) => <th key={item}>{item}</th>)}</tr></thead><tbody>{gradePageRows.map((row) => { const line = getThreshold(dataset, exam, row.track); return <tr key={studentKey(row)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedStudent(row); setView("students"); } }} onClick={() => { setSelectedStudent(row); setView("students"); }}><td>{dataset.school}</td><td>{row.classNo}班</td><td className="student-link">{row.name}</td><td>{row.classType}</td><td>{row.combination}</td><td><b>{format1(row.total)}</b></td><td>{typeof line?.topTotal === "number" ? format1(row.total - line.topTotal) : "—"}</td><td>{typeof line?.undergraduateTotal === "number" ? format1(row.total - line.undergraduateTotal) : "—"}</td><td>{row.cityRank ?? "—"}</td><td>{row.schoolRank ?? "—"}</td>{["语文", "数学", "英语", "日语", "物理", "历史", "化学", "生物", "政治", "地理"].map((item) => <td key={item}>{row.subjects[item as SubjectName] === undefined ? "—" : format1(row.subjects[item as SubjectName]!)}</td>)}</tr>; })}</tbody></table></div>
    {searchedStudents.length > gradePageSize && <div className="table-pagination" aria-label="成绩表分页"><button disabled={safeGradePage <= 1} onClick={() => setGradePage((page) => Math.max(1, page - 1))}>上一页</button><span>第{safeGradePage} / {gradePageCount}页</span><button disabled={safeGradePage >= gradePageCount} onClick={() => setGradePage((page) => Math.min(gradePageCount, page + 1))}>下一页</button></div>}
  </Panel>;

  const renderClasses = () => {
    const data = currentClassSummaries.map((item) => ({ name: `${item.classNo}班`, 平均分: Number(item.average.toFixed(1)), 一本率: Number((item.topRate * 100).toFixed(1)), 本科率: Number((item.undergraduateRate * 100).toFixed(1)) }));
    return <div className="two-column">
      <Panel title="班级横向对比" subtitle="平均分与上线率分轴呈现，建议优先在同班型内比较" action={<TierLegend />} className="span-2"><div className="chart-box tall"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} barGap={4} margin={{ top: 18, right: 8, left: -8, bottom: 0 }}><defs><ChartGradient id="classScoreFill" from="#7B75F8" to="#CAC7FF" /><ChartGradient id="classTopFill" from="#F4B44B" to="#F8DFAB" /><ChartGradient id="classUnderFill" from="#27C2B7" to="#AFEAE4" /></defs><CartesianGrid {...chartGridProps} /><XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} /><YAxis yAxisId="left" tick={axisStyle} tickLine={false} axisLine={false} /><YAxis yAxisId="right" orientation="right" tick={axisStyle} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} /><Tooltip content={<PremiumTooltip units={{ 平均分: " 分", 一本率: "%", 本科率: "%" }} />} cursor={{ fill: CHART_COLORS.cursor }} /><Legend content={<PremiumLegend />} /><Bar yAxisId="left" dataKey="平均分" fill="url(#classScoreFill)" radius={[7, 7, 2, 2]} maxBarSize={22} animationDuration={800} /><Bar yAxisId="right" dataKey="一本率" fill="url(#classTopFill)" radius={[7, 7, 2, 2]} maxBarSize={22} animationDuration={1000} /><Bar yAxisId="right" dataKey="本科率" fill="url(#classUnderFill)" radius={[7, 7, 2, 2]} maxBarSize={22} animationDuration={1200} /></BarChart></ResponsiveContainer></div></Panel>
      <Panel title="班级指标排名" subtitle="点击班级进入该班分析" className="span-2"><div className="data-table"><table><thead><tr><th>班级</th><th>类别</th><th>班型</th><th>人数</th><th>平均分</th><th>一本人数/率</th><th>本科人数/率</th><th>操作</th></tr></thead><tbody>{[...currentClassSummaries].sort((a, b) => b.average - a.average).map((item, index) => <tr key={item.classNo}><td><b>{index + 1}. {item.classNo}班</b></td><td>{item.track}</td><td>{item.type}</td><td>{item.count}</td><td>{format1(item.average)}</td><td>{item.topCount} / {percent(item.topRate)}</td><td>{item.undergraduateCount} / {percent(item.undergraduateRate)}</td><td><button className="table-action" onClick={() => setClassNo(item.classNo)}>只看该班</button></td></tr>)}</tbody></table></div></Panel>
      <Panel title="同类对标雷达" subtitle="平均分差、一本率差和本科率差均相对同组基准" className="span-2"><div className="data-table"><table><thead><tr><th>班级</th><th>对标组</th><th>均分差</th><th>一本率差</th><th>本科率差</th><th>同组位次</th></tr></thead><tbody>{benchmarkRows.filter((item) => classNo === "全部" || item.classNo === classNo).map((item) => <tr key={`benchmark-${item.classNo}`}><td>{item.classNo}班</td><td>{item.peerGroup}</td><td className={item.averageDelta >= 0 ? "positive" : "negative"}>{item.averageDelta >= 0 ? "+" : ""}{format1(item.averageDelta)}</td><td className={item.topRateDelta >= 0 ? "positive" : "negative"}>{item.topRateDelta >= 0 ? "+" : ""}{percent(item.topRateDelta)}</td><td className={item.undergraduateRateDelta >= 0 ? "positive" : "negative"}>{item.undergraduateRateDelta >= 0 ? "+" : ""}{percent(item.undergraduateRateDelta)}</td><td>{item.peerRank} / {item.peerSize}</td></tr>)}</tbody></table></div></Panel>
    </div>;
  };

  const renderSubjects = () => {
    const selected = subjects.find((item) => item.subject === activeSubject) ?? subjects[0];
    const classData = currentClassSummaries.map((item) => ({ name: `${item.classNo}班`, average: Number((item.subjectAverages[activeSubject] ?? 0).toFixed(1)) })).filter((item) => item.average > 0);
    return <div className="two-column">
      <Panel title="学科选择" subtitle="切换学科查看班级横向差异"><div className="subject-pills">{subjects.map((item) => <button className={activeSubject === item.subject ? "active" : ""} onClick={() => setSubject(item.subject)} key={item.subject}>{item.subject}<span>{format1(item.average)}</span></button>)}</div></Panel>
      <div className="mini-stat-row"><StatCard icon={BarChart3} label={`${selected?.subject ?? activeSubject}平均分`} value={selected ? format1(selected.average) : "—"} note={`最高分${selected ? format1(selected.max) : "—"}`} /><StatCard icon={Target} label="一本学科有效" value={`${selected?.topEffectiveCount ?? 0}人`} note={`有效线${selected?.topEffectiveLine ? format1(selected.topEffectiveLine) : "未设置"} · ${percent(selected?.topEffectiveRate ?? 0)}`} tone="orange" /><StatCard icon={CheckCircle2} label="本科学科有效" value={`${selected?.undergraduateEffectiveCount ?? 0}人`} note={`有效线${selected?.undergraduateEffectiveLine ? format1(selected.undergraduateEffectiveLine) : "未设置"} · ${percent(selected?.undergraduateEffectiveRate ?? 0)}`} tone="green" /></div>
      <Panel title={`${activeSubject}班级横向对比`} subtitle="只比较实际参加该学科的班级；基线为当前范围均分" className="span-2"><div className="chart-box tall"><ResponsiveContainer width="100%" height="100%"><BarChart data={classData} margin={{ top: 18, right: 12, left: -8, bottom: 0 }}><defs><ChartGradient id="subjectClassFill" from="#766FF7" to="#D6D3FF" /></defs><CartesianGrid {...chartGridProps} /><XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} /><YAxis tick={axisStyle} tickLine={false} axisLine={false} domain={["dataMin - 8", "dataMax + 5"]} /><ReferenceLine y={selected?.average} stroke={VISUAL_COLORS.cyanDark} strokeDasharray="5 5" label={{ value: "范围均分", fill: VISUAL_COLORS.cyanDark, fontSize: 9 }} /><Tooltip content={<PremiumTooltip units={{ 平均分: " 分" }} />} cursor={{ fill: CHART_COLORS.cursor }} /><Bar dataKey="average" name="平均分" fill="url(#subjectClassFill)" radius={[9, 9, 3, 3]} maxBarSize={48} animationDuration={1000} /></BarChart></ResponsiveContainer></div></Panel>
      <Panel title="各学科概览" subtitle="一本与本科有效上线双口径" className="span-2"><div className="data-table"><table><thead><tr><th>学科</th><th>参考人数</th><th>平均分</th><th>最高分</th><th>一本有效分</th><th>一本人数/率</th><th>本科有效分</th><th>本科人数/率</th></tr></thead><tbody>{subjects.map((item) => <tr key={item.subject}><td><b>{item.subject}</b></td><td>{item.count}</td><td>{format1(item.average)}</td><td>{format1(item.max)}</td><td>{item.topEffectiveLine ? format1(item.topEffectiveLine) : "未设置"}</td><td>{item.topEffectiveCount} / {percent(item.topEffectiveRate)}</td><td>{item.undergraduateEffectiveLine ? format1(item.undergraduateEffectiveLine) : "未设置"}</td><td>{item.undergraduateEffectiveCount} / {percent(item.undergraduateEffectiveRate)}</td></tr>)}</tbody></table></div></Panel>
      <Panel title={`${activeSubject}知识点优先级`} subtitle="把小题得分率聚合为可执行的补弱顺序" className="span-2"><div className="knowledge-layout"><div className="knowledge-priority">{knowledgeData.slice(0, 8).map((item, index) => <div key={`${item.knowledge}-${index}`}><span className={`priority-${item.priority === "优先补弱" ? "high" : item.priority === "巩固提升" ? "mid" : "keep"}`}>{item.priority}</span><b>{item.knowledge}</b><small>{item.questionCount}题 · {item.responseCount.toLocaleString()}次作答</small><strong>{percent(item.rate)}</strong></div>)}</div><div className="knowledge-note"><Sparkles size={19} /><p><b>如何使用</b><span>优先补弱 = 低得分率且已覆盖的共性问题；巩固提升 = 需要分层作业；优势保持 = 保持高阶题训练。</span></p></div></div></Panel>
    </div>;
  };

  const renderStudents = () => {
    const selected = selectedStudent && activeScores.some((row) => sameStudent(row, selectedStudent))
      ? selectedStudent
      : [...activeScores].sort((a, b) => b.total - a.total)[0] ?? null;
    if (!selected) return <EmptyState text="当前范围没有学生数据" />;
    const history = dataset.scores.filter((row) => sameStudent(row, selected)).map((row) => ({ exam: row.exam, total: row.total, 市排名: row.cityRank }));
    const threshold = getThreshold(dataset, exam, selected.track);
    const subjectData = relevantSubjects(getClassProfile(selected.classNo, selected.rawExam, dataset.classProfiles)).map((item) => ({ subject: item, score: selected.subjects[item] ?? null, topLine: threshold?.topSubjects[item] ?? null, undergraduateLine: threshold?.undergraduateSubjects[item] ?? null }));
    return <div className="student-layout">
      <Panel title="学生检索" subtitle="点击姓名查看完整画像"><div className="search-box full"><Search size={16} /><input value={studentQuery} onChange={(event) => { setStudentQuery(event.target.value); setGradePage(1); }} placeholder="输入姓名、学号或班级" aria-label="搜索学生" /></div><div className="student-results">{searchedStudents.slice(0, 20).map((row) => <button className={sameStudent(selected, row) ? "active" : ""} onClick={() => setSelectedStudent(row)} key={studentKey(row)}><span>{row.name}<small>{row.classNo}班 · {row.studentId ? `学号${row.studentId} · ` : ""}{row.classType}</small></span><b>{format1(row.total)}</b></button>)}</div></Panel>
      <div className="student-main">
        <div className="student-hero"><div className="avatar">{selected.name.slice(-1)}</div><div><span>{selected.classNo}班 · {selected.combination} · {selected.classType}</span><h1>{selected.name}</h1><p>{exam}总分 {format1(selected.total)} · 市排名 {selected.cityRank ?? "—"} · 校排名 {selected.schoolRank ?? "—"}</p></div><div className="student-status">{typeof threshold?.topTotal === "number" && selected.total >= threshold.topTotal ? <StatusTag tone="warn">一本上线</StatusTag> : typeof threshold?.undergraduateTotal === "number" && selected.total >= threshold.undergraduateTotal ? <StatusTag tone="good">本科上线</StatusTag> : <StatusTag tone="bad">重点关注</StatusTag>}</div></div>
        <div className="two-column">
          <Panel title="历次考试走势" subtitle="总分变化"><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><AreaChart data={history} margin={{ top: 16, right: 14, left: -8, bottom: 0 }}><defs><linearGradient id="studentTrendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={VISUAL_COLORS.primary} stopOpacity={.34} /><stop offset="100%" stopColor={VISUAL_COLORS.primary} stopOpacity={.02} /></linearGradient></defs><CartesianGrid {...chartGridProps} /><XAxis dataKey="exam" tick={axisStyle} tickLine={false} axisLine={false} /><YAxis tick={axisStyle} tickLine={false} axisLine={false} domain={["dataMin - 20", "dataMax + 20"]} /><Tooltip content={<PremiumTooltip units={{ 总分: " 分" }} />} /><Area type="monotone" dataKey="total" name="总分" stroke={VISUAL_COLORS.primary} strokeWidth={3} fill="url(#studentTrendFill)" dot={{ r: 4, fill: "#fff", stroke: VISUAL_COLORS.primary, strokeWidth: 2 }} activeDot={{ r: 6, fill: VISUAL_COLORS.primary, stroke: "#fff", strokeWidth: 3 }} /></AreaChart></ResponsiveContainer></div></Panel>
          <Panel title="学科上线诊断" subtitle="个人分数与一本、本科有效分对照；缺失学科不会伪造为0分" action={<TierLegend />}><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><BarChart data={subjectData} margin={{ top: 14, right: 8, left: -8, bottom: 0 }} barGap={3}><defs><ChartGradient id="studentSubjectFill" from="#756EF7" to="#CAC7FF" /><ChartGradient id="studentTopFill" from="#F3AE3D" to="#F9E0A8" /><ChartGradient id="studentUnderFill" from="#26C0B5" to="#AEE9E3" /></defs><CartesianGrid {...chartGridProps} /><XAxis dataKey="subject" tick={axisStyle} tickLine={false} axisLine={false} /><YAxis tick={axisStyle} tickLine={false} axisLine={false} /><Tooltip content={<PremiumTooltip units={{ 个人分数: " 分", 一本有效分: " 分", 本科有效分: " 分" }} />} cursor={{ fill: CHART_COLORS.cursor }} /><Legend content={<PremiumLegend />} /><Bar dataKey="score" name="个人分数" fill="url(#studentSubjectFill)" radius={[6, 6, 2, 2]} maxBarSize={18} animationDuration={700} /><Bar dataKey="topLine" name="一本有效分" fill="url(#studentTopFill)" radius={[6, 6, 2, 2]} maxBarSize={18} animationDuration={950} /><Bar dataKey="undergraduateLine" name="本科有效分" fill="url(#studentUnderFill)" radius={[6, 6, 2, 2]} maxBarSize={18} animationDuration={1150} /></BarChart></ResponsiveContainer></div></Panel>
        </div>
        <Panel title="学科明细" subtitle="分别显示距离一本、本科有效分的差值；缺失字段显示为—"><div className="student-subject-grid">{subjectData.map((item) => { const topDiff = item.topLine !== null && item.score !== null ? item.score - item.topLine : null; const undergraduateDiff = item.undergraduateLine !== null && item.score !== null ? item.score - item.undergraduateLine : null; return <div key={item.subject}><span>{item.subject}</span><b>{item.score === null ? "—" : format1(item.score)}</b><small className={topDiff !== null && topDiff < 0 ? "negative" : "positive"}>一本 {topDiff === null ? "—" : `${topDiff >= 0 ? "+" : ""}${format1(topDiff)}`}</small><small className={undergraduateDiff !== null && undergraduateDiff < 0 ? "negative" : "positive"}>本科 {undergraduateDiff === null ? "—" : `${undergraduateDiff >= 0 ? "+" : ""}${format1(undergraduateDiff)}`}</small></div>; })}</div></Panel>
      </div>
    </div>;
  };

  const renderOnline = () => <div className="two-column">
    <Panel title="上线结构与临界区间" subtitle="一本与本科临界生分别统计" action={<TierLegend />}><div className="online-summary"><div className="tier-top"><span>特控/一本上线</span><b>{topCount}</b><small>{percent(activeScores.length ? topCount / activeScores.length : 0)}</small></div><div className="tier-undergraduate"><span>本科上线</span><b>{undergraduateCount}</b><small>{percent(activeScores.length ? undergraduateCount / activeScores.length : 0)}</small></div><div className="tier-top"><span>一本线下10分</span><b>{topCritical.filter((row) => (row.topDiff ?? -999) >= -10).length}</b><small>优先冲一本</small></div><div className="tier-top"><span>一本线下20分</span><b>{topCritical.length}</b><small>一本临界</small></div><div className="tier-undergraduate"><span>本科线下10分</span><b>{undergraduateCritical.filter((row) => (row.undergraduateDiff ?? -999) >= -10).length}</b><small>优先保本科</small></div><div className="tier-undergraduate"><span>本科线下20分</span><b>{undergraduateCritical.length}</b><small>本科临界</small></div></div></Panel>
    <Panel title="班级上线完成情况" subtitle="双轨进度条：橙色一本，绿色本科" action={<TierLegend />}><div className="class-online-list">{currentClassSummaries.map((item) => <div key={item.classNo}><b>{item.classNo}班</b><span>{item.type}</span><div className="dual-progress"><i className="top" style={{ width: `${item.topRate * 100}%` }} /><i className="undergraduate" style={{ width: `${item.undergraduateRate * 100}%` }} /></div><strong><em>一本 {item.topCount}人 · {percent(item.topRate)}</em><em>本科 {item.undergraduateCount}人 · {percent(item.undergraduateRate)}</em></strong></div>)}</div></Panel>
    <Panel title="临界生与薄弱学科" subtitle="一本/本科分开标识，点击学生进入个人画像" className="span-2"><div className="data-table"><table><thead><tr><th>临界类型</th><th>班级</th><th>姓名</th><th>总分</th><th>一本差</th><th>本科差</th><th>薄弱学科</th><th>建议</th></tr></thead><tbody>{critical.map((item) => <tr key={studentKey(item)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedStudent(item); setView("students"); } }} onClick={() => { setSelectedStudent(item); setView("students"); }}><td>{item.criticalTiers.map((tier) => <StatusTag key={tier} tone={tier === "一本" ? "warn" : "good"}>{tier}</StatusTag>)}</td><td>{item.classNo}班</td><td className="student-link">{item.name}</td><td>{format1(item.total)}</td><td className={(item.topDiff ?? 0) < 0 ? "negative" : "positive"}>{item.topDiff === null ? "—" : format1(item.topDiff)}</td><td className={(item.undergraduateDiff ?? 0) < 0 ? "negative" : "positive"}>{item.undergraduateDiff === null ? "—" : format1(item.undergraduateDiff)}</td><td>{item.weakSubjects.slice(0, 3).map((weak) => `${weak.subject}${format1(weak.diff)}`).join("、") || "—"}</td><td><StatusTag tone="warn">重点跟踪</StatusTag></td></tr>)}</tbody></table></div></Panel>
  </div>;

  const renderItems = () => {
    const lowItems = [...itemStats].sort((a, b) => a.rate - b.rate);
    const chartData = itemStats.map((item) => ({ name: item.question, 得分率: Number((item.rate * 100).toFixed(1)) }));
    const emptyItemText = classNo === 7 && activeSubject === "日语"
      ? "源表的英语小题表未包含7班日语答题记录，系统不会将缺失数据按0分计算"
      : "这次考试尚未识别到该学科的小题数据";
    return <div className="two-column">
      <Panel title="小题分析条件" subtitle="选择学科和班级后自动重算"><div className="subject-pills">{subjects.map((item) => <button className={activeSubject === item.subject ? "active" : ""} onClick={() => setSubject(item.subject)} key={item.subject}>{item.subject}</button>)}</div><div className="item-summary"><div><span>识别题目</span><b>{questionBank.length}</b></div><div><span>答题记录</span><b>{itemRows.length}</b></div><div><span>平均得分率</span><b>{itemStats.length ? percent(average(itemStats.map((item) => item.rate))) : "—"}</b></div></div></Panel>
      <Panel title="薄弱知识点" subtitle="按小题得分率从低到高"><div className="weak-list">{lowItems.slice(0, 6).map((item, index) => <div key={`${item.question}-${index}`}><span className="rank">{index + 1}</span><div><b>{item.knowledge}</b><small>{item.question} · 均分{format1(item.average)}/{item.maxScore ?? "—"}{item.maxScoreSource === "inferred" ? " · 推断满分" : ""}</small></div><strong>{percent(item.rate)}</strong></div>)}</div></Panel>
      <Panel title={`${activeSubject}小题得分率`} subtitle="琥珀色为重点补弱，紫色为基本掌握，青绿色为优势保持" className="span-2">{chartData.length ? <div className="chart-box tall"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 18, right: 12, left: -8, bottom: 0 }}><CartesianGrid {...chartGridProps} /><XAxis dataKey="name" interval="preserveStartEnd" minTickGap={12} tickMargin={8} height={34} tick={axisStyle} tickLine={false} axisLine={false} /><YAxis unit="%" domain={[0, 100]} tick={axisStyle} tickLine={false} axisLine={false} /><ReferenceLine y={60} stroke={VISUAL_COLORS.amberDark} strokeDasharray="4 5" label={{ value: "补弱线 60%", fill: VISUAL_COLORS.amberDark, fontSize: 9, position: "insideTopLeft" }} /><ReferenceLine y={80} stroke={VISUAL_COLORS.cyanDark} strokeDasharray="4 5" label={{ value: "掌握线 80%", fill: VISUAL_COLORS.cyanDark, fontSize: 9, position: "insideTopLeft" }} /><Tooltip content={<PremiumTooltip units={{ 得分率: "%" }} />} cursor={{ fill: CHART_COLORS.cursor }} /><Bar dataKey="得分率" radius={[7, 7, 2, 2]} maxBarSize={32} animationDuration={1000}>{chartData.map((item, index) => <Cell key={index} fill={item.得分率 < 60 ? VISUAL_COLORS.amber : item.得分率 >= 80 ? VISUAL_COLORS.cyan : VISUAL_COLORS.primary} />)}</Bar></BarChart></ResponsiveContainer></div> : <EmptyState text={emptyItemText} />}</Panel>
      <Panel title="小题明细" subtitle="分值、知识点、平均得分和得分率；推断满分带有标记" className="span-2"><div className="data-table"><table><thead><tr><th>题号</th><th>知识点</th><th>满分</th><th>平均分</th><th>得分率</th><th>诊断</th></tr></thead><tbody>{itemStats.map((item) => <tr key={item.question}><td>{item.question}</td><td>{item.knowledge}</td><td>{item.maxScore ?? "—"}{item.maxScoreSource === "inferred" ? "*" : ""}</td><td>{format1(item.average)}</td><td>{percent(item.rate)}</td><td><StatusTag tone={item.rate >= .75 ? "good" : item.rate >= .6 ? "neutral" : "warn"}>{item.rate >= .75 ? "掌握较好" : item.rate >= .6 ? "基本掌握" : "重点补弱"}</StatusTag></td></tr>)}</tbody></table></div></Panel>
    </div>;
  };

  const renderHistory = () => {
    const previous = historyData.at(-2);
    const latest = historyData.at(-1);
    const comparableIndex = previous?.topLineIndex !== null && previous?.topLineIndex !== undefined && latest?.topLineIndex !== null && latest?.topLineIndex !== undefined;
    return <div className="two-column">
      <Panel title="历次考试年级趋势" subtitle="不同考试总分尺度可能不同，统一换算为一本线达成指数（100=达到当次一本线）" action={<TierLegend />} className="span-2"><div className="chart-box tall"><ResponsiveContainer width="100%" height="100%"><LineChart data={historyData} margin={{ top: 18, right: 14, left: 0, bottom: 0 }}><CartesianGrid {...chartGridProps} /><XAxis dataKey="exam" tick={axisStyle} tickLine={false} axisLine={false} /><YAxis yAxisId="score" width={42} tick={axisStyle} tickLine={false} axisLine={false} domain={["dataMin - 10", "dataMax + 10"]} /><YAxis yAxisId="rate" width={42} orientation="right" unit="%" domain={[0, 100]} tick={axisStyle} tickLine={false} axisLine={false} /><ReferenceLine yAxisId="score" y={100} stroke={VISUAL_COLORS.primary} strokeDasharray="5 5" label={{ value: "一本线", fill: VISUAL_COLORS.primary, fontSize: 9 }} /><Tooltip content={<PremiumTooltip units={{ 一本线达成指数: "", 一本上线率: "%", 本科上线率: "%", 参考人数: " 人" }} />} /><Legend content={<PremiumLegend />} /><Line yAxisId="score" type="monotone" dataKey="topLineIndex" name="一本线达成指数" stroke={VISUAL_COLORS.primary} strokeWidth={3} connectNulls dot={{ r: 4, fill: "#fff", stroke: VISUAL_COLORS.primary, strokeWidth: 2 }} activeDot={{ r: 6, fill: VISUAL_COLORS.primary, stroke: "#fff", strokeWidth: 3 }} animationDuration={700} /><Line yAxisId="rate" type="monotone" dataKey="topRate" name="一本上线率" stroke={VISUAL_COLORS.amber} strokeWidth={2.5} dot={{ r: 3, fill: "#fff", strokeWidth: 2 }} animationDuration={950} /><Line yAxisId="rate" type="monotone" dataKey="undergraduateRate" name="本科上线率" stroke={VISUAL_COLORS.cyan} strokeWidth={2.5} dot={{ r: 3, fill: "#fff", strokeWidth: 2 }} animationDuration={1150} /></LineChart></ResponsiveContainer></div></Panel>
      <Panel title="考试节点对比" subtitle="原始均分仅供查看，环比采用统一指数"><div className="history-cards">{historyData.map((item, index) => { const prior = historyData[index - 1]; const canCompare = item.topLineIndex !== null && prior?.topLineIndex !== null && prior?.topLineIndex !== undefined; const delta = canCompare ? item.topLineIndex! - prior.topLineIndex! : null; return <div key={item.exam}><span>{item.exam} · {item.count}人</span><b>{item.topLineIndex === null ? "—" : item.topLineIndex.toFixed(1)}</b><small>一本线指数 · 原始均分{format1(item.average)}</small><em className={delta === null || delta >= 0 ? "positive" : "negative"}>{index === 0 ? "基准" : delta === null ? "缺分数线" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`}</em></div>; })}</div></Panel>
      <Panel title="增值观察" subtitle="优先采用相对分数线指数和上线率"><div className="insight-list"><div><CheckCircle2 /><p><b>一本线指数</b><span>{historyData.length > 1 ? comparableIndex ? `较${previous!.exam}${latest!.topLineIndex! >= previous!.topLineIndex! ? "提高" : "下降"}${Math.abs(latest!.topLineIndex! - previous!.topLineIndex!).toFixed(1)}点` : "最近两次存在缺失分数线，暂不做指数环比" : "暂无对比考试"}</span></p></div><div><Medal /><p><b>一本上线率</b><span>{historyData.length > 1 ? `较上次${latest!.topRate >= previous!.topRate ? "提高" : "下降"}${Math.abs(latest!.topRate - previous!.topRate).toFixed(1)}个百分点` : "暂无对比考试"}</span></p></div><div><Target /><p><b>本科上线率</b><span>{historyData.length > 1 ? `较上次${latest!.undergraduateRate >= previous!.undergraduateRate ? "提高" : "下降"}${Math.abs(latest!.undergraduateRate - previous!.undergraduateRate).toFixed(1)}个百分点` : "暂无对比考试"}</span></p></div><div><AlertTriangle /><p><b>样本提醒</b><span>{historyData.length > 1 && latest!.count !== previous!.count ? `最近两次参考人数为${previous!.count}人与${latest!.count}人，人数不等时不要直接比较上线人数。` : "最近两次参考人数一致，可结合人数与比例共同判断。"}</span></p></div></div></Panel>
    </div>;
  };

  const renderReports = () => <div className="report-layout">
    <Panel title="报告模板" subtitle="当前筛选条件将自动带入报告"><div className="report-types">{REPORT_TYPES.map((name) => <button className={reportType === name ? "active" : ""} key={name} onClick={() => setReportType(name)}><FileText size={19} /><span>{name}</span><small>已可生成</small></button>)}</div><div className="export-actions"><button className="primary-button" onClick={exportWord} disabled={exporting !== null}>{exporting === "word" ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}{exporting === "word" ? "正在生成" : "导出Word（详细）"}</button><button className="secondary-button" onClick={exportPdf} disabled={exporting !== null}>{exporting === "pdf" ? <LoaderCircle className="spin" size={17} /> : <Printer size={17} />}{exporting === "pdf" ? "正在生成" : "导出PDF（分页）"}</button><button className="excel-button" onClick={exportExcel} disabled={exporting !== null}>{exporting === "excel" ? <LoaderCircle className="spin" size={17} /> : <FileSpreadsheet size={17} />}{exporting === "excel" ? "正在生成" : "导出分析Excel"}</button></div><div className="export-manifest"><span>8章正式报告</span><span>13张Excel工作表</span><span>Word、PDF内置可视化</span><span>学生、班级、学科、小题、质检全覆盖</span></div><p className="export-note">Word适合正式复盘，PDF适合打印留档，Excel适合二次筛选与分发；三者共用同一份分析模型。</p></Panel>
    <div className="report-preview"><div className="preview-label">报告预览</div><ReportBody dataset={dataset} exam={exam} track={track} classNo={classNo} reportType={reportType} chartPrefix="preview" /></div>
  </div>;

  const renderSettings = () => <div className="two-column">
    <Panel title="隐私与本机数据" subtitle="学生数据不会上传；你可以决定是否保存在当前浏览器" className="span-2"><div className="privacy-control"><div className="persistence-card"><div><ShieldCheck /><p><b>自动保存到本机</b><span>{persistenceEnabled ? "已开启：每次导入或保存规则后保留最近5个版本" : "已关闭：后续导入仅在当前页面会话中使用"}</span></p></div><button className={`switch-button ${persistenceEnabled ? "on" : ""}`} role="switch" aria-checked={persistenceEnabled} onClick={() => togglePersistence(!persistenceEnabled)}><i /><span>{persistenceEnabled ? "已开启" : "已关闭"}</span></button></div><div className="history-manager"><div className="history-manager-head"><div><b>本机历史版本</b><span>{storageHistory.length ? `共${storageHistory.length}个，最多保留5个` : "暂无历史版本"}</span></div><button className="danger-button" onClick={() => setConfirmingClear(true)} disabled={!storageHistory.length && dataset.id === "demo"}>一键清空本机数据</button></div>{storageHistory.length > 0 && <div className="history-version-list">{storageHistory.map((item) => <div key={item.key}><div><b>{item.school}</b><span>保存于{cnDate(item.storedAt)} · {item.examCount}次考试 · {item.scoreCount.toLocaleString()}条</span><small>{item.sourceName} · 导入于{cnDate(item.importedAt)}</small></div><div><button onClick={() => restoreDatasetVersion(item.key)}>恢复</button><button className="remove" onClick={() => removeDatasetVersion(item.key)}>删除</button></div></div>)}</div>}</div></div></Panel>
    <Panel title="班型与选科规则" subtitle="修改会即时影响班级归类、学科口径和后续导入；保存后可跨会话复用" action={<div className="rule-actions"><button className="secondary-button" onClick={resetClassRules}>恢复预置</button><button className="primary-button" onClick={saveRulesAndData}>保存规则</button></div>} className="span-2"><div className="data-table rule-table"><table><thead><tr><th>班级</th><th>类别</th><th>选科组合</th><th>班型</th><th>外语</th><th>源表列转换</th></tr></thead><tbody>{Object.values(dataset.classProfiles ?? CLASS_PROFILES).sort((a, b) => a.classNo - b.classNo).map((item) => { const sourceRule = item.subjectSourceOverrides?.日语 === "英语" ? "english-japanese" : item.subjectSourceOverrides?.地理 === "生物" ? "biology-geography" : "none"; return <tr key={item.classNo}><td><b>{item.classNo}班</b></td><td><SelectMenu className="table-select" ariaLabel={`${item.classNo}班类别`} value={item.track} onChange={(trackValue) => updateClassRule(item.classNo, { track: trackValue as Track })} options={["物理类", "历史类", "未配置"].map((value) => ({ value, label: value }))} /></td><td><SelectMenu className="table-select" ariaLabel={`${item.classNo}班选科组合`} value={item.combination} onChange={(combination) => updateClassRule(item.classNo, { combination })} options={["物化生", "物化地", "历政地", "艺术", "待配置"].map((value) => ({ value, label: value }))} /></td><td><input value={item.type} onChange={(event) => updateClassRule(item.classNo, { type: event.target.value })} aria-label={`${item.classNo}班班型`} /></td><td><SelectMenu className="table-select" ariaLabel={`${item.classNo}班外语`} value={item.language ?? (item.classNo === 7 ? "日语" : "英语")} onChange={(language) => updateClassRule(item.classNo, { language: language as "英语" | "日语" })} options={["英语", "日语"].map((value) => ({ value, label: value }))} /></td><td><SelectMenu className="table-select source-select" ariaLabel={`${item.classNo}班源表列转换`} value={sourceRule} onChange={(rule) => updateSubjectSourceRule(item.classNo, rule as "none" | "english-japanese" | "biology-geography")} options={[{ value: "none", label: "按原列" }, { value: "english-japanese", label: "英语列 → 日语" }, { value: "biology-geography", label: "生物列 → 地理" }]} /></td></tr>; })}</tbody></table></div><p className="rule-note"><AlertTriangle size={14} />“源表列转换”用于工作簿本身沿用旧列名的特殊班级；普通班请选择“按原列”。修改转换规则后，请重新导入原工作簿以重读对应学科分数。</p></Panel>
    <Panel title="当前数据健康度" subtitle="评分综合核心字段识别、学科、分数线与真实质检问题" action={<StatusTag tone={dataQualityScore >= 90 ? "good" : dataQualityScore >= 75 ? "warn" : "bad"}>{dataQualityScore}分</StatusTag>}><div className="quality-detail"><div><span>综合识别置信度</span><b>{percent(profileConfidence)}</b><i><em style={{ width: `${profileConfidence * 100}%` }} /></i></div><div className="identity-method"><span>学生身份关联</span><b>{identityCoverage ? "学号优先" : "班级＋姓名"}</b><small>学号为可选字段，不计入数据质量评分；所有记录保留源行号</small></div><div><span>学科字段完整度</span><b>{percent(subjectCompleteness)}</b><i><em style={{ width: `${subjectCompleteness * 100}%` }} /></i></div><div><span>一本/本科线完整度</span><b>{percent(thresholdCompleteness)}</b><i><em style={{ width: `${thresholdCompleteness * 100}%` }} /></i></div><div><span>当前有效成绩</span><b>{activeScores.length.toLocaleString()}条</b><small>缺失单科显示“—”，不计入均分分母</small></div><div><span>数据提醒</span><b>{warningCount}项</b><small>只对影响分析结果的警告与错误扣分</small></div></div></Panel>
    <Panel title="当前考试分数线" subtitle={`${exam} · 修改后即时重算上线、临界和报告`}><div className="threshold-cards editable">{(["物理类", "历史类"] as Track[]).map((item) => { const line = getThreshold(dataset, exam, item); return <div key={item}><b>{item}</b><label><span>特控/一本线</span><input type="number" min="0" max="750" step="0.1" value={line?.topTotal ?? ""} placeholder="未设置" onChange={(event) => updateThresholdValue(item, "topTotal", event.target.value)} /></label><label><span>本科线</span><input type="number" min="0" max="750" step="0.1" value={line?.undergraduateTotal ?? ""} placeholder="未设置" onChange={(event) => updateThresholdValue(item, "undergraduateTotal", event.target.value)} /></label></div>; })}</div><button className="primary-button threshold-save" onClick={saveRulesAndData}>保存当前规则与分数线</button></Panel>
    <Panel title="模块可用性矩阵" subtitle="字段缺失时关闭受影响指标，其他模块继续可用" className="span-2"><div className="capability-grid">{(dataset.profile?.capabilities ?? []).map((capability) => <div key={capability.id} className={capability.available ? "available" : "unavailable"}><div><b>{capability.label}</b><span>{capability.available ? "可用" : "降级"}</span></div><i><em style={{ width: `${capability.confidence * 100}%` }} /></i><small>{capability.reason}</small></div>)}</div></Panel>
    <Panel title="字段识别映射" subtitle="识别策略会随表格列插入、改名和空列自动重算" className="span-2"><div className="data-table"><table><thead><tr><th>字段</th><th>源表表头</th><th>列号</th><th>策略</th><th>置信度</th></tr></thead><tbody>{(dataset.profile?.fieldMatches ?? []).map((match) => <tr key={`${match.field}-${match.column}`}><td>{match.field}</td><td>{match.header || "未识别"}</td><td>{match.column === null ? "—" : match.column + 1}</td><td>{match.strategy}</td><td>{percent(match.confidence)}</td></tr>)}</tbody></table></div></Panel>
    <Panel title="导入质量检查" subtitle="问题按严重程度列出，其他可用模块继续工作" className="span-2"><div className="issue-list">{datasetIssues.length ? datasetIssues.map((issue, index) => <div key={index} className={issue.level}><span>{issue.level === "error" ? <X size={16} /> : issue.level === "warning" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}</span><p>{issue.message}{issue.rowNumbers?.length ? <small>源表行号：{issue.rowNumbers.join("、")}</small> : issue.suggestion ? <small>{issue.suggestion}</small> : null}</p></div>) : <div className="success-state"><CheckCircle2 />未发现明显数据问题</div>}</div></Panel>
  </div>;

  const renderView = () => {
    switch (view) {
      case "dashboard": return renderDashboard();
      case "grade": return renderGrade();
      case "classes": return renderClasses();
      case "subjects": return renderSubjects();
      case "students": return renderStudents();
      case "online": return renderOnline();
      case "items": return renderItems();
      case "history": return renderHistory();
      case "reports": return renderReports();
      case "settings": return renderSettings();
    }
  };

  return (
    <div className="app-shell">
      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <div className="brand"><div className="brand-mark"><School /></div><div className="brand-copy"><strong>质量慧析</strong><span>QUALITY INTELLIGENCE</span></div><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="关闭菜单"><X /></button></div>
        <div className="sidebar-workspace"><span>当前工作区</span><b>{dataset.school || "考试质量分析"}</b><small><i className={dataset.id === "demo" ? "demo" : "live"} />{dataset.id === "demo" ? "示例数据，可随时替换" : `${dataset.exams.length} 场考试已就绪`}</small></div>
        <nav>{(["总览", "深度分析", "报告与配置"] as const).map((group) => <div className="nav-group" key={group}><span className="nav-group-label">{group}</span>{navItems.filter((item) => item.group === group).map(({ id, label, description, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} title={description} onClick={() => { setView(id); setMenuOpen(false); }}><span className="nav-icon"><Icon size={17} strokeWidth={1.8} /></span><span>{label}</span>{id === "online" && critical.length > 0 && <em>{critical.length}</em>}</button>)}</div>)}</nav>
        <div className="sidebar-footer"><div className="source-icon"><ShieldCheck size={17} /></div><div><span>LOCAL FIRST</span><b>数据只保存在本机</b></div></div>
      </aside>
      {menuOpen && <button className="overlay" aria-label="关闭菜单" onClick={() => setMenuOpen(false)} />}
      <main>
        <header className="topbar">
          <div className="topbar-leading"><button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="打开菜单"><Menu /></button><div className="topbar-context"><span>质量慧析 / {navItems.find((item) => item.id === view)?.group}</span><strong>{navItems.find((item) => item.id === view)?.label}</strong></div></div>
          <div className="filters" aria-label="分析范围筛选">
            <label><span>考试</span><SelectMenu className="topbar-select exam-select" ariaLabel="筛选考试" value={exam} onChange={(nextExam) => { setExam(nextExam); setGradePage(1); }} options={dataset.exams.map((item) => ({ value: item, label: item }))} /></label>
            <label><span>类别</span><SelectMenu className="topbar-select" ariaLabel="筛选类别" value={track} onChange={(nextTrack) => { setTrack(nextTrack as Track | "全部"); setClassNo("全部"); setGradePage(1); }} options={["全部", "物理类", "历史类"].map((item) => ({ value: item, label: item }))} /></label>
            <label><span>班级</span><SelectMenu className="topbar-select" ariaLabel="筛选班级" value={String(classNo)} onChange={(nextClass) => { setClassNo(nextClass === "全部" ? "全部" : Number(nextClass)); setGradePage(1); }} options={[{ value: "全部", label: "全部" }, ...classOptions.map((item) => ({ value: String(item), label: `${item}班` }))]} /></label>
          </div>
          <div className="topbar-actions"><div className="data-badge"><span className={dataset.id === "demo" ? "demo" : "live"} />{dataset.id === "demo" ? "示例数据" : `${dataset.school} · ${persistenceEnabled ? "本机数据" : "当前会话"}`}</div><button className="quick-export" onClick={exportWord} disabled={exporting !== null} title="导出当前筛选范围的Word报告"><FileText size={16} />Word</button><button className="quick-export" onClick={exportPdf} disabled={exporting !== null} title="导出当前筛选范围的PDF报告"><Printer size={16} />PDF</button><button className="import-button" onClick={() => fileRef.current?.click()} disabled={importing}>{importing ? <LoaderCircle className="spin" size={17} /> : <Upload size={17} />}{importing ? "正在解析" : "导入Excel"}</button></div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm" hidden onChange={(event) => handleImport(event.target.files?.[0])} />
        </header>
        {importMessage && <div className={`import-message ${importMessage.includes("失败") || importMessage.includes("没有找到") || importMessage.includes("无法") ? "error" : importMessage.includes("提醒") || importMessage.includes("未能保存") ? "warning" : "success"}`} role="status"><span>{importMessage}</span><button aria-label="关闭消息" onClick={() => setImportMessage(null)}><X size={15} /></button></div>}
        <div className="content">{view !== "dashboard" && <div className="view-intro"><div><span>{navItems.find((item) => item.id === view)?.group} / {exam}</span><h1>{navItems.find((item) => item.id === view)?.label}</h1><p>{navItems.find((item) => item.id === view)?.description}</p></div><div className="scope-chips"><span>{track}</span><span>{classNo === "全部" ? "全年级" : `${classNo}班`}</span><span>{activeScores.length.toLocaleString()} 人</span></div></div>}<div className="view-stage" key={`${view}-${exam}-${track}-${classNo}`}>{renderView()}</div></div>
        {(exporting === "word" || exporting === "pdf") && <div className="export-report-host" aria-hidden="true"><ReportBody dataset={dataset} exam={exam} track={track} classNo={classNo} reportType={reportType} reportId="export-report-content" chartPrefix="export" fullDetails /></div>}
        <footer className="app-footer"><span>质量慧析 · 本地优先的考试质量分析</span><span>数据更新时间 {cnDate(dataset.importedAt)}</span></footer>
      </main>
          {importDraft && <ImportReviewDialog dataset={importDraft} options={importOptions} confirming={confirmingImport} onChange={updateImportOptions} onCancel={() => setImportDraft(null)} onConfirm={confirmImport} />}
          {confirmingClear && <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmingClear(false); }}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-data-title"><div className="confirm-icon"><AlertTriangle /></div><h2 id="clear-data-title">确定清空本机数据？</h2><p>这会删除当前浏览器中保存的最新成绩和全部历史版本，删除后无法恢复。网页会切换到虚拟示例数据。</p><div><button className="secondary-button" autoFocus onClick={() => setConfirmingClear(false)}>取消</button><button className="danger-button solid" onClick={clearAllLocalData}>确认清空</button></div></section></div>}
    </div>
  );
}
