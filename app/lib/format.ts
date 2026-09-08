// Non-finite metrics represent unavailable data, never a failed student or a 0% rate.
export const metric = (value: number | null | undefined, digits = 0) => typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
export const percentage = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
