export type RateMetric = {
  value: number | null;
  count: number | null;
  status: "available" | "partial" | "missing" | "empty";
  eligibleCount: number;
  totalCount: number;
  excludedCount: number;
  reason: string;
};
export const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export const rateMetric = (count: number, eligibleCount: number, totalCount: number, reason = "缺少适用分数线") : RateMetric => ({
  value: eligibleCount ? count / eligibleCount : null,
  count: eligibleCount ? count : null,
  status: !totalCount ? "empty" : !eligibleCount ? "missing" : eligibleCount < totalCount ? "partial" : "available",
  eligibleCount, totalCount, excludedCount: totalCount-eligibleCount,
  reason: !totalCount ? "当前范围没有有效记录" : !eligibleCount ? reason : eligibleCount < totalCount ? `${eligibleCount}/${totalCount}人可计算，排除${totalCount-eligibleCount}人` : `${eligibleCount}人全部可计算`,
});
export const nullableDelta = (a: number | null, b: number | null) => finite(a) && finite(b) ? a-b : null;
export const ascendingMetric = (a: number | null, b: number | null) => !finite(a) ? (!finite(b) ? 0 : 1) : !finite(b) ? -1 : a-b;
export const descendingMetric = (a: number | null, b: number | null) => !finite(a) ? (!finite(b) ? 0 : 1) : !finite(b) ? -1 : b-a;
