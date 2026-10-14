import assert from "node:assert/strict";
import test from "node:test";
import { payback } from "./index";
import { readChart } from "./sources";

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
test("paused activity never contacts Grafana or PostHog even with credentials", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    assert.fail("Paused activity must not make requests");
  });
  const panel = await payback(
    {
      GRAFANA_URL: "https://example.org",
      GRAFANA_TOKEN: "test-only",
      SUPABASE_DS_UID: "test",
      EXCLUDE_EMAILS: "internal@example.org",
      POSTHOG_HOST: "https://example.org",
      POSTHOG_API_KEY: "test-only",
      POSTHOG_PROJECT_ID: "test",
    },
    new URLSearchParams(),
  );
  assert.deepEqual(panel.activity, { accounts: null, checkins: null, offers: null });
  assert.equal(
    panel.sources.find((source) => source.name === "Supabase via Grafana")?.status,
    "paused",
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
