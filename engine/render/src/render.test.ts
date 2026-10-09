import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import type { Factors } from "@latere/core";
import sharp from "sharp";
import { renderPhoto } from "./photo";
import { removeSupersededRender, renderSlideshow } from "./render";

async function background() {
  return sharp({ create: { width: 1080, height: 1920, channels: 3, background: "#acb3aa" } })
    .png()
    .toBuffer();
}

const copy = {
  body: "Five things to try",
  role: "hook" as const,
  aspect: "9:16" as const,
  brand: "@getnonyxa",
};

test("the locked deployment dependency graph contains no browser renderer", async () => {
  const lock = JSON.parse(
    await readFile(new URL("../../../package-lock.json", import.meta.url), "utf8"),
  );
  for (const name of Object.keys(lock.packages)) {
    assert.doesNotMatch(
      name,
      /node_modules\/(?:@remotion\/|remotion(?:\/|$)|puppeteer(?:-core)?(?:\/|$)|playwright(?:-core)?(?:\/|$))/,
    );
  }
});

test("native renderer produces both output sizes with text inside its canvas", async () => {
  for (const aspect of ["9:16", "4:5"] as const) {
    const result = await renderPhoto(await background(), { ...copy, aspect });
    const output = await sharp(result.png).metadata();
    assert.equal(output.width, 1080);
    assert.equal(output.height, aspect === "9:16" ? 1920 : 1350);
    assert.equal(output.format, "png");
    const box = result.report.text_box;
    assert.ok(box.left > 0 && box.left + box.width < 1080);
    assert.ok(box.top > 0 && box.top + box.height < result.report.height);
    assert.equal(result.report.subject_analysis, "not_run");
  }
});

test("text markup is literal and unreadably long text is rejected", async () => {
  const image = await background();
  const result = await renderPhoto(image, { ...copy, body: '<b>Literal</b> & "quoted"' });
  assert.equal(result.report.text_fit, "passed");
  await assert.rejects(
    renderPhoto(image, { ...copy, body: "long copy ".repeat(180) }),
    /minimum readable/,
  );
  await assert.rejects(renderPhoto(image, { ...copy, body: " " }), /characters/);
  await assert.rejects(renderPhoto(Buffer.from("broken"), copy));
});

test("placement scores favor a quiet region over a busy region", async () => {
  const stripes = Array.from(
    { length: 90 },
    (_, i) => `<rect x="${i * 12}" y="0" width="6" height="650" fill="white"/>`,
  ).join("");
  const input = await sharp(
    Buffer.from(
      `<svg width="1080" height="1920"><rect width="1080" height="1920" fill="black"/>${stripes}</svg>`,
    ),
  )
    .png()
    .toBuffer();
  const { report } = await renderPhoto(input, copy);
  assert.notEqual(report.placement, "top");
  const top = report.candidates.find((candidate) => candidate.position === "top");
  const selected = report.candidates.find((candidate) => candidate.position === report.placement);
  assert.ok(top && selected && top.complexity > selected.complexity);
});

test("slideshow outputs are complete, ordered, cached, and failed attempts are removed", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "latere-render-"));
  const oldData = process.env.GTM_DATA_DIR;
  const oldBase = process.env.LATERE_SUPABASE_URL;
  process.env.GTM_DATA_DIR = directory;
  process.env.LATERE_SUPABASE_URL = "https://assets.example.test";
  t.after(async () => {
    if (oldData === undefined) delete process.env.GTM_DATA_DIR;
    else process.env.GTM_DATA_DIR = oldData;
    if (oldBase === undefined) delete process.env.LATERE_SUPABASE_URL;
    else process.env.LATERE_SUPABASE_URL = oldBase;
    await rm(directory, { recursive: true, force: true });
  });
  const image = await background();
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(new Uint8Array(image)),
  );
  const factors: Factors = {
    aspect: "9:16",
    slide_count: 6,
    composition: {
      format: "list",
      segments: [],
      slides: Array.from({ length: 6 }, (_, i) => ({
        background: { url: "https://assets.example.test/storage/v1/object/public/media/a.png" },
        text: { body: i ? `Item ${i}` : "Five things", role: i ? "beat" : "hook" },
      })),
    },
  };
  const result = await renderSlideshow("sample", factors);
  assert.equal(result.paths.length, 6);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.ok(result.paths[5]?.endsWith("slide_06.png"));
  const first = result.paths[0];
  assert.ok(first);
  const report = JSON.parse(await readFile(join(dirname(first), "report.json"), "utf8"));
  assert.equal(report.human_review_required, true);
  assert.equal(report.slides.length, 6);
  assert.match(report.slides[0].sha256, /^[a-f0-9]{64}$/);
  await assert.rejects(renderSlideshow("../escape", factors), /Invalid render ID/);
  await assert.rejects(
    renderSlideshow("video", { composition: { format: "video", segments: [] } }),
    /video rendering was removed/,
  );
  const replacement = await renderSlideshow("sample", factors);
  const current = dirname(replacement.paths[0]!);
  const previous = dirname(first);
  await removeSupersededRender("sample", previous, previous);
  assert.ok((await readdir(previous)).includes("report.json"));
  await removeSupersededRender("another", previous, current);
  assert.ok((await readdir(previous)).includes("report.json"));
  await removeSupersededRender("sample", directory, current);
  assert.ok((await readdir(directory)).includes("renders"));
  await removeSupersededRender("sample", previous, current);
  await assert.rejects(readdir(previous), { code: "ENOENT" });
  assert.ok((await readdir(current)).includes("report.json"));
  const last = factors.composition?.slides?.[5];
  assert.ok(last);
  last.background.url = "https://other.example.test/image.png";
  await assert.rejects(renderSlideshow("failed", factors), /Latere Supabase media bucket/);
  assert.equal(
    (await readdir(join(directory, "renders"))).filter((name) => name.startsWith("failed-")).length,
    0,
  );
  last.background.url = "https://assets.example.test/storage/v1/object/public/media/b.png";
  fetchMock.mock.mockImplementation(
    async () => new Response(new Uint8Array(Buffer.from("broken"))),
  );
  await assert.rejects(renderSlideshow("corrupt", factors));
  assert.equal(
    (await readdir(join(directory, "renders"))).filter((name) => name.startsWith("corrupt-"))
      .length,
    0,
  );
});
