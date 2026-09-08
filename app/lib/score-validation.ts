import type { ScoreCellState } from "./types";
export function classifyScore(value: unknown, max?: number): {value: number | null; state: ScoreCellState} {
  const raw=String(value ?? "").trim();
  if (!raw) return {value:null,state:"missing"};
  if (/^(缺考|缺|未考|absent)$/i.test(raw)) return {value:null,state:"absent"};
  if (/^(缓考|补考待定)$/.test(raw)) return {value:null,state:"deferred"};
  if (/^(未选科|不适用|免考|—|-)$/.test(raw)) return {value:null,state:"not-applicable"};
  if (/^#/.test(raw)) return {value:null,state:"formula-error"};
  const parsed=typeof value === "number" ? value : Number(raw.replace(/,/g,""));
  if (typeof value === "boolean" || !Number.isFinite(parsed) || parsed<0 || (max !== undefined && parsed>max)) return {value:null,state:"invalid"};
  return {value:parsed,state:"valid"};
}
export const scoreStateLabel = { valid:"有效", missing:"空白", absent:"缺考", deferred:"缓考", "not-applicable":"不适用", "formula-error":"公式错误", invalid:"异常数值", "identity-conflict":"同键冲突" };
