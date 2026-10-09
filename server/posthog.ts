export interface PosthogConfig {
  host: string;
  projectId: string;
  apiKey: string;
}

export async function hogql<T>(config: PosthogConfig, query: string): Promise<T[]> {
  const response = await fetch(`${config.host}/api/projects/${config.projectId}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`PostHog ${response.status}: ${text.slice(0, 200)}`);

  const body = JSON.parse(text) as { columns?: string[]; results?: unknown[][] };
  const columns = body.columns ?? [];
  return (body.results ?? []).map(
    (row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])) as T,
  );
}
