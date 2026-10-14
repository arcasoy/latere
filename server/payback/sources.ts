type Env = Record<string, string | undefined>;

async function json<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Source request failed (HTTP ${response.status})`);
  return response.json() as Promise<T>;
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
