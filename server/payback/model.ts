export const GRAFANA_PAUSED_DETAIL =
  "Paused. This connection used Grafana to read Nonyxa accounts and first completed check-ins, then matched accounts to PostHog paywall offers. These figures are unavailable until a new connection is chosen. Nonyxa owns the Grafana dashboard.";

export type Grain = "day" | "week" | "month";
export interface Chart {
  measures: { display_name: string }[];
  values: { cohort: number; measure: number; value: number | null; incomplete: boolean }[];
  unsupported_params?: unknown;
  yaxis_currency?: string;
}
export interface ChartRow {
  start: string;
  incomplete: boolean;
  values: (number | null)[];
}
export function chartRows(chart: Chart, names: string[]): ChartRow[] {
  if (
    !Array.isArray(chart.measures) ||
    !Array.isArray(chart.values) ||
    (chart.unsupported_params && Object.keys(chart.unsupported_params).length)
  )
    throw new Error("Unexpected RevenueCat chart response");
  const indices = names.map((name) => chart.measures.findIndex((m) => m.display_name === name));
  if (indices.includes(-1)) throw new Error("RevenueCat chart is missing a required measure");
  const rows = new Map<number, ChartRow>();
  const seen = new Set<string>();
  for (const point of chart.values) {
    const column = indices.indexOf(point.measure);
    if (column < 0) continue;
    if (!Number.isFinite(point.cohort) || (point.value !== null && !Number.isFinite(point.value)))
      throw new Error("Unreadable RevenueCat chart value");
    const key = `${point.cohort}:${point.measure}`;
    if (seen.has(key)) throw new Error("Duplicate RevenueCat chart value");
    seen.add(key);
    const row = rows.get(point.cohort) ?? {
      start: new Date(point.cohort * 1000).toISOString().slice(0, 10),
      incomplete: false,
      values: names.map(() => null),
    };
    row.values[column] = point.value;
    row.incomplete ||= point.incomplete;
    rows.set(point.cohort, row);
  }
  return [...rows.values()].sort((a, b) => b.start.localeCompare(a.start));
}
