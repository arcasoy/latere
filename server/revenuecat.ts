const API = "https://api.revenuecat.com/v2";

interface RevenueCatConfig {
  apiKey: string;
  projectId: string;
}

export interface RevenueMetric {
  id: string;
  name: string;
  value: number;
  unit: string;
  window: string;
}

export type RevenuePanel =
  | { configured: false; missing: string[] }
  | {
      configured: true;
      generatedAt: string;
      currency: string;
      metrics: RevenueMetric[];
      errors: string[];
    };

interface OverviewMetric {
  id?: string;
  name?: string;
  value?: number;
  unit?: string;
  description?: string;
}

async function overview(config: RevenueCatConfig): Promise<{
  currency: string;
  metrics: RevenueMetric[];
}> {
  const response = await fetch(`${API}/projects/${config.projectId}/metrics/overview`, {
    headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" },
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`RevenueCat ${response.status}: ${text.slice(0, 200)}`);

  const body = JSON.parse(text) as { currency?: string; metrics?: OverviewMetric[] };
  return {
    currency: body.currency ?? "USD",
    metrics: (body.metrics ?? []).map((m) => ({
      id: m.id ?? "",
      name: m.name ?? m.id ?? "",
      value: Number(m.value ?? 0),
      unit: m.unit ?? "#",
      window: m.description ?? "",
    })),
  };
}

export async function revenue(env: Record<string, string | undefined>): Promise<RevenuePanel> {
  const config = {
    apiKey: env.REVENUECAT_API_KEY as string,
    projectId: env.REVENUECAT_PROJECT_ID as string,
  };
  const missing = [
    !config.apiKey && "REVENUECAT_API_KEY",
    !config.projectId && "REVENUECAT_PROJECT_ID",
  ].filter((x): x is string => Boolean(x));
  if (missing.length) return { configured: false, missing };

  try {
    const { currency, metrics } = await overview(config);
    return {
      configured: true,
      generatedAt: new Date().toISOString(),
      currency,
      metrics,
      errors: [],
    };
  } catch (error) {
    return {
      configured: true,
      generatedAt: new Date().toISOString(),
      currency: "USD",
      metrics: [],
      errors: [`RevenueCat: ${(error as Error).message}`],
    };
  }
}
