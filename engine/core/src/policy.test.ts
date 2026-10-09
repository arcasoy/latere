import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { decideBatch } from "./policy";
import type { Shot } from "./types";

test("policy selects photo formats and honors five promised items without forcing a CTA", async (t) => {
  const previousUrl = process.env.LATERE_SUPABASE_URL;
  const previousKey = process.env.LATERE_SUPABASE_SECRET_KEY;
  process.env.LATERE_SUPABASE_URL = "https://latere.test";
  process.env.LATERE_SUPABASE_SECRET_KEY = "sb_secret_test";
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("[]", { headers: { "Content-Type": "application/json" } }),
  );
  t.after(() => {
    if (previousUrl === undefined) delete process.env.LATERE_SUPABASE_URL;
    else process.env.LATERE_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.LATERE_SUPABASE_SECRET_KEY;
    else process.env.LATERE_SUPABASE_SECRET_KEY = previousKey;
  });
  const root = await mkdtemp(join(tmpdir(), "latere-policy-"));
  const previous = process.env.GTM_ROOT;
  process.env.GTM_ROOT = root;
  t.after(async () => {
    if (previous === undefined) delete process.env.GTM_ROOT;
    else process.env.GTM_ROOT = previous;
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, "content"));
  await writeFile(
    join(root, "content", "formats.yaml"),
    JSON.stringify({
      formats: [
        { id: "old-video", duration_s: [12, 20], segments: [] },
        {
          id: "photo",
          label: "Photo",
          kind: "slideshow",
          slides: [4, 8],
          segments: [{ role: "background" }],
        },
      ],
    }),
  );
  const hooksFile = join(root, "content", "hooks.yaml");
  await writeFile(
    hooksFile,
    JSON.stringify({ hooks: [{ id: "five", type: "listicle", text: "5 things to try" }] }),
  );
  const shots: Shot[] = [
    {
      id: "image",
      key: "raw/image.png",
      kind: "image",
      url: "https://example.test/image.png",
      tags: ["lifestyle"],
      created_at: "2026-10-08T00:00:00Z",
    },
  ];
  const gif: Shot = { ...shots[0]!, id: "gif", key: "raw/animation.gif" };
  const unavailable = await decideBatch([], [gif], { batchSize: 1 });
  assert.equal(unavailable.renders.length, 0);
  assert.equal(unavailable.requests.length, 1);
  shots.push(gif);
  const batch = await decideBatch([], shots, { batchSize: 1 });
  const candidate = batch.renders[0];
  assert.ok(candidate);
  assert.equal(candidate.factors.format, "photo");
  assert.ok(
    candidate.factors.composition?.slides?.every((slide) => slide.background.shot_id === "image"),
  );
  assert.equal(candidate.factors.slide_count, 6);
  assert.equal(candidate.factors.copy_style, "numbered");
  assert.deepEqual(candidate.factors.used_tags, ["lifestyle"]);
  assert.equal(
    candidate.factors.composition?.slides?.filter((slide) => slide.text?.role === "beat").length,
    5,
  );
  assert.ok(
    candidate.factors.composition?.slides?.every(
      (slide) => slide.text?.position === undefined && slide.text?.role !== "cta",
    ),
  );
  await writeFile(
    hooksFile,
    JSON.stringify({
      hooks: [{ id: "story", type: "pov", text: "I spent 5 years hiding my hands" }],
    }),
  );
  const story = (await decideBatch([], shots, { batchSize: 1 })).renders[0];
  assert.ok(story?.factors.composition?.slides?.some((slide) => slide.text?.role === "cta"));
});
