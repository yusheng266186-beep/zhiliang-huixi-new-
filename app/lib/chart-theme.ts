// 图表配色唯一来源：page.tsx（图例、统计卡）与 charts.tsx（懒加载图表）共用，
// 独立成模块是为了避免 page.tsx 静态引用 charts.tsx 时把 recharts 拖回首屏包。
export const CHART_COLORS = { primary: "#5B5BD6", secondary: "#8B5CF6", grid: "#E7E7EC", cursor: "rgba(91,91,214,.055)" } as const;
export const TIER_COLORS = { top: "#F59E0B", undergraduate: "#10B981", neutral: "#A1A1AA" } as const;
