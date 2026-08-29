// 图表组件统一放这里并通过 React.lazy 引入：
// recharts 体积约 350KB(min)，只在首次渲染含图表的视图时加载，不进首屏包。
// 组件只返回 ResponsiveContainer 块，外层容器（chart-box / pie-wrap 等）仍由 page.tsx 持有，DOM 结构不变。
"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_COLORS, TIER_COLORS } from "../lib/chart-theme";

const COLORS = [TIER_COLORS.top, TIER_COLORS.undergraduate, TIER_COLORS.neutral, CHART_COLORS.primary, CHART_COLORS.secondary];

export const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

type ChartRow = Record<string, unknown>;

export function DistributionChart({ bins, medianBinLabel }: { bins: ChartRow[]; medianBinLabel?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%"><BarChart data={bins} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}><CartesianGrid strokeDasharray="2 6" vertical={false} stroke={CHART_COLORS.grid} /><XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} /><YAxis allowDecimals={false} tick={{ fontSize: 9 }} /><Tooltip formatter={(value, name) => { const numeric = typeof value === "number" ? value : 0; const label = String(name); return [label === "rate" ? percent(numeric) : numeric, label === "count" ? "人数" : "占比"]; }} /><ReferenceLine x={medianBinLabel} stroke="#5B5BD6" strokeDasharray="4 4" label={{ value: "中位数", fill: "#5B5BD6", fontSize: 10 }} /><Bar dataKey="count" name="人数" fill="#7770E6" radius={[7, 7, 2, 2]} animationDuration={900} /></BarChart></ResponsiveContainer>
  );
}

export function RateBarsChart({ data }: { data: ChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}><CartesianGrid strokeDasharray="2 6" vertical={false} stroke={CHART_COLORS.grid} /><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} unit="%" domain={[0, 100]} /><Tooltip cursor={{ fill: CHART_COLORS.cursor }} /><Legend /><Bar dataKey="一本率" fill={TIER_COLORS.top} radius={[7, 7, 2, 2]} animationDuration={900} /><Bar dataKey="本科率" fill={TIER_COLORS.undergraduate} radius={[7, 7, 2, 2]} animationDuration={1100} /></BarChart></ResponsiveContainer>
  );
}

export function TrackPieChart({ data }: { data: ChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={56} outerRadius={84} paddingAngle={3} animationDuration={1000}>{data.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /><Legend verticalAlign="bottom" /></PieChart></ResponsiveContainer>
  );
}

export function ClassCompareChart({ data }: { data: ChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid strokeDasharray="2 6" vertical={false} stroke={CHART_COLORS.grid} /><XAxis dataKey="name" /><YAxis yAxisId="left" /><YAxis yAxisId="right" orientation="right" unit="%" domain={[0, 100]} /><Tooltip cursor={{ fill: CHART_COLORS.cursor }} /><Legend /><Bar yAxisId="left" dataKey="平均分" fill={CHART_COLORS.primary} radius={[6, 6, 2, 2]} animationDuration={800} /><Bar yAxisId="right" dataKey="一本率" fill={TIER_COLORS.top} radius={[6, 6, 2, 2]} animationDuration={1000} /><Bar yAxisId="right" dataKey="本科率" fill={TIER_COLORS.undergraduate} radius={[6, 6, 2, 2]} animationDuration={1200} /></BarChart></ResponsiveContainer>
  );
}

export function SubjectClassChart({ data }: { data: ChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid strokeDasharray="2 6" vertical={false} stroke={CHART_COLORS.grid} /><XAxis dataKey="name" /><YAxis domain={["dataMin - 8", "dataMax + 5"]} /><Tooltip cursor={{ fill: CHART_COLORS.cursor }} /><Bar dataKey="average" name="平均分" fill={CHART_COLORS.primary} radius={[7, 7, 2, 2]} animationDuration={1000} /></BarChart></ResponsiveContainer>
  );
}

export function HistoryLineChart({ data }: { data: ChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid strokeDasharray="2 6" vertical={false} stroke={CHART_COLORS.grid} /><XAxis dataKey="exam" /><YAxis domain={["dataMin - 20", "dataMax + 20"]} /><Tooltip /><Line type="monotone" dataKey="total" stroke={CHART_COLORS.primary} strokeWidth={3} dot={{ r: 4, fill: "#fff", strokeWidth: 2 }} /></LineChart></ResponsiveContainer>
  );
}

export function SubjectDiagnosisChart({ data }: { data: ChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid strokeDasharray="2 6" vertical={false} stroke={CHART_COLORS.grid} /><XAxis dataKey="subject" /><YAxis /><Tooltip cursor={{ fill: CHART_COLORS.cursor }} /><Legend /><Bar dataKey="score" name="个人分数" fill={CHART_COLORS.primary} radius={[6, 6, 2, 2]} animationDuration={700} /><Bar dataKey="topLine" name="一本有效分" fill={TIER_COLORS.top} radius={[6, 6, 2, 2]} animationDuration={950} /><Bar dataKey="undergraduateLine" name="本科有效分" fill={TIER_COLORS.undergraduate} radius={[6, 6, 2, 2]} animationDuration={1150} /></BarChart></ResponsiveContainer>
  );
}

export function ItemRateChart({ data }: { data: ChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid strokeDasharray="2 6" vertical={false} stroke={CHART_COLORS.grid} /><XAxis dataKey="name" interval={0} angle={-25} textAnchor="end" height={58} /><YAxis unit="%" domain={[0, 100]} /><Tooltip cursor={{ fill: CHART_COLORS.cursor }} /><Bar dataKey="得分率" radius={[6, 6, 2, 2]} animationDuration={1000}>{data.map((item, index) => <Cell key={index} fill={Number(item["得分率"]) < 60 ? "#F97316" : Number(item["得分率"]) >= 80 ? TIER_COLORS.undergraduate : CHART_COLORS.primary} />)}</Bar></BarChart></ResponsiveContainer>
  );
}

export function GradeTrendChart({ data }: { data: ChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid strokeDasharray="2 6" vertical={false} stroke={CHART_COLORS.grid} /><XAxis dataKey="exam" /><YAxis yAxisId="score" domain={["dataMin - 20", "dataMax + 20"]} /><YAxis yAxisId="count" orientation="right" /><Tooltip /><Legend /><Line yAxisId="score" type="monotone" dataKey="average" name="平均分" stroke={CHART_COLORS.primary} strokeWidth={3} animationDuration={700} /><Line yAxisId="count" type="monotone" dataKey="top" name="一本上线" stroke={TIER_COLORS.top} strokeWidth={3} animationDuration={950} /><Line yAxisId="count" type="monotone" dataKey="undergraduate" name="本科上线" stroke={TIER_COLORS.undergraduate} strokeWidth={3} animationDuration={1150} /></LineChart></ResponsiveContainer>
  );
}
