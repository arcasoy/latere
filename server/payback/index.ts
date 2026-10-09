import { type ChartRow, chartRows, type Grain } from "./model";
import { readAccounts, readBehaviors, readChart } from "./sources";

interface Source {
  name: string;
  status: "ready" | "missing" | "failed";
  detail: string;
}
export interface PaybackPanel {
  configured: true;
  asOf: string;
  start: string;
  end: string;
  grain: Grain;
  cohorts: ChartRow[] | null;
  proceeds: ChartRow[] | null;
  activity: { accounts: number | null; checkins: number | null; offers: number | null };
  sources: Source[];
}
export async function payback(
  env: Record<string, string | undefined>,
  params: URLSearchParams,
): Promise<PaybackPanel> {
  const asOf = new Date();
  const end = asOf.toISOString().slice(0, 10);
  const days = [30, 90, 180].includes(Number(params.get("days"))) ? Number(params.get("days")) : 90;
  const startAt = Date.parse(end) - (days - 1) * 86400000;
  const start = new Date(startAt).toISOString().slice(0, 10);
  const grain: Grain =
    params.get("grain") === "day" ? "day" : params.get("grain") === "month" ? "month" : "week";
  const resolution = { day: "0", week: "1", month: "2" }[grain];
  const sources: Source[] = [];
  async function source<T>(
    name: string,
    vars: string[],
    read: () => Promise<T>,
  ): Promise<T | null> {
    const missing = vars.filter((key) => !env[key]);
    if (missing.length) {
      sources.push({ name, status: "missing", detail: `Missing ${missing.join(", ")}` });
      return null;
    }
    try {
      const value = await read();
      sources.push({ name, status: "ready", detail: "Fetched from provider for this request" });
      return value;
    } catch (error) {
      sources.push({ name, status: "failed", detail: (error as Error).message });
      return null;
    }
  }
  const rc = ["REVENUECAT_API_KEY", "REVENUECAT_PROJECT_ID"];
  const [accounts, behaviors, cohorts, proceeds] = await Promise.all([
    source(
      "Supabase via Grafana",
      ["GRAFANA_URL", "GRAFANA_TOKEN", "SUPABASE_DS_UID", "EXCLUDE_EMAILS"],
      () => readAccounts(env),
    ),
    source("PostHog", ["POSTHOG_HOST", "POSTHOG_API_KEY", "POSTHOG_PROJECT_ID"], () =>
      readBehaviors(env, asOf.getTime()),
    ),
    source("RevenueCat trials", rc, async () =>
      chartRows(await readChart(env, "trial_conversion", start, end, resolution), [
        "New Customers",
        "Started Trials",
        "Converted Trials",
        "Set To Convert",
        "Set To Cancel",
        "Abandoned Trials",
      ]),
    ),
    source("RevenueCat proceeds", rc, async () => {
      const chart = await readChart(env, "revenue", start, end, resolution);
      if (chart.yaxis_currency !== "USD")
        throw new Error("RevenueCat proceeds currency is not USD");
      return chartRows(chart, ["Proceeds"]);
    }),
  ]);
  const within = (at: number) => at >= startAt && at <= asOf.getTime();
  const ids = new Set(accounts?.map((a) => a.id));
  return {
    configured: true,
    asOf: asOf.toISOString(),
    start,
    end,
    grain,
    cohorts,
    proceeds,
    sources,
    activity: {
      accounts: accounts ? accounts.filter((a) => within(a.createdAt)).length : null,
      checkins: accounts
        ? accounts.filter((a) => a.completedAt !== null && within(a.completedAt)).length
        : null,
      offers:
        accounts && behaviors
          ? new Set(behaviors.filter((e) => ids.has(e.userId) && within(e.at)).map((e) => e.userId))
              .size
          : null,
    },
  };
}
