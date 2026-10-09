import { hogql } from "../posthog";
import type { Account, Behavior } from "./model";

type Env = Record<string, string | undefined>;

async function json<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Source request failed (HTTP ${response.status})`);
  return response.json() as Promise<T>;
}

function accountsSql(excluded: string): string {
  const emails = excluded
    .split(",")
    .filter((email) => email.trim().length > 0)
    .map((email) => `'${email.trim().replaceAll("'", "''")}'`)
    .join(",");
  if (!emails) throw new Error("Account exclusions must match the existing Grafana configuration");
  return `
with slots as (
  select entry_id, hand, finger, min(labeled_at) as at
  from bi.finger_labels group by 1,2,3
), complete as (
  select entry_id, max(at) as at from slots group by 1 having count(*) = 10
), firsts as (
  select de.user_id, min(c.at) as completed
  from bi.daily_entries de join complete c on c.entry_id = de.id group by 1
)
select u.id::text, u.created_at, f.completed
from bi.users u left join firsts f on f.user_id = u.id
where not u.internal and coalesce(u.email, '') not in
(${emails})
order by u.created_at`;
}

export async function readAccounts(env: Env): Promise<Account[]> {
  const result = await json<{
    results: { A: { error?: string; frames?: Array<{ data: { values: unknown[][] } }> } };
  }>(`${env.GRAFANA_URL}/api/ds/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GRAFANA_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      queries: [
        {
          refId: "A",
          datasource: { type: "grafana-postgresql-datasource", uid: env.SUPABASE_DS_UID },
          rawSql: accountsSql(env.EXCLUDE_EMAILS ?? ""),
          format: "table",
          rawQuery: true,
        },
      ],
      from: "0",
      to: String(Date.now()),
    }),
  });
  const frame = result.results.A;
  if (frame.error || !frame.frames?.length)
    throw new Error("Account query did not return a complete table");
  const values = frame.frames[0]?.data.values;
  if (values?.length !== 3) throw new Error("Account query returned an unexpected shape");
  return (values[0] ?? []).map((id, i) => {
    const createdAt = Number(values[1]?.[i]);
    const completedAt = values[2]?.[i] == null ? null : Number(values[2]?.[i]);
    if (!Number.isFinite(createdAt) || (completedAt !== null && !Number.isFinite(completedAt)))
      throw new Error("Account timestamps are unreadable");
    return { id: String(id), createdAt, completedAt };
  });
}

export async function readBehaviors(env: Env, asOf: number): Promise<Behavior[]> {
  const cutoff = new Date(asOf).toISOString().replace("T", " ").replace("Z", "");
  const rows = await hogql<{ id: string; user_id: string; at: string }>(
    {
      host: env.POSTHOG_HOST ?? "",
      projectId: env.POSTHOG_PROJECT_ID ?? "",
      apiKey: env.POSTHOG_API_KEY ?? "",
    },
    `select uuid as id, distinct_id as user_id, min(timestamp) as at
    from events where timestamp < toDateTime('${cutoff}', 'UTC')
    and event = 'paywall_offer_shown' and properties.had_offering = true
    group by uuid, distinct_id order by at limit 100000`,
  );
  if (rows.length >= 100000)
    throw new Error("Event export reached its row limit; coverage is incomplete");
  return rows.map((r) => {
    const value = /Z$|[+-]\d\d:?\d\d$/.test(r.at) ? r.at : `${r.at.replace(" ", "T")}Z`;
    const at = Date.parse(value);
    if (!Number.isFinite(at)) throw new Error("Event timestamp is unreadable");
    return { id: r.id, userId: r.user_id, at };
  });
}

export async function readChart(
  env: Env,
  chart: string,
  start: string,
  end: string,
  resolution: string,
) {
  const url = new URL(
    `https://api.revenuecat.com/v2/projects/${encodeURIComponent(env.REVENUECAT_PROJECT_ID ?? "")}/charts/${chart}`,
  );
  url.search = new URLSearchParams({
    start_date: start,
    end_date: end,
    resolution,
    realtime: "true",
    expand_periods: "false",
  }).toString();
  if (chart === "revenue")
    url.searchParams.set("selectors", JSON.stringify({ revenue_type: "proceeds" }));
  return json<import("./model").Chart>(url.href, {
    headers: { Authorization: `Bearer ${env.REVENUECAT_API_KEY}` },
  });
}
