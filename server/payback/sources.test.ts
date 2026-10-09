import assert from "node:assert/strict";
import test from "node:test";
import { payback } from "./index";
import { readAccounts, readChart } from "./sources";

const env = { REVENUECAT_PROJECT_ID: "project", REVENUECAT_API_KEY: "test-only" };
test("charts request fresh proceeds directly without any customer scan", async (t) => {
  const urls: URL[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    urls.push(new URL(url));
    return Response.json({});
  });
  await readChart(env, "revenue", "2026-06-01", "2026-09-27", "1");
  assert.equal(urls.length, 1);
  assert.equal(urls[0]?.pathname, "/v2/projects/project/charts/revenue");
  assert.equal(urls[0]?.searchParams.get("selectors"), '{"revenue_type":"proceeds"}');
  assert.equal(urls[0]?.searchParams.get("realtime"), "true");
});
test("failed account query cannot be interpreted as no accounts", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ results: { A: { error: "failed", frames: [] } } }),
  );
  await assert.rejects(
    readAccounts({ GRAFANA_URL: "https://example.org", EXCLUDE_EMAILS: "internal@example.org" }),
    /complete table/,
  );
});
test("provider failure remains unavailable and every request fetches again", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("", { status: 429 });
  });
  const first = await payback(env, new URLSearchParams());
  const second = await payback(env, new URLSearchParams());
  assert.equal(calls, 4);
  assert.equal(first.cohorts, null);
  assert.equal(second.proceeds, null);
  assert.equal(second.activity.accounts, null);
});
