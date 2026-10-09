import assert from "node:assert/strict";
import { test } from "node:test";
import { validateManifest } from "./manifest";

function at<T>(items: T[], index: number): T {
  const item = items[index];
  assert.ok(item !== undefined);
  return item;
}

function fixture(items = 5, cta = false) {
  const hook = `${items} things to try`;
  return {
    version: 1,
    request_key: "daily-2026-10-08",
    posts: [
      {
        id: "post-1",
        template_version: "editorial-v1",
        promised_items: items,
        factors: {
          hook_text: hook,
          aspect: "9:16",
          used_tags: ["confession", "hands"],
          composition: {
            format: "list",
            segments: [],
            slides: [
              {
                id: "cover",
                background: { shot_id: "asset-cover" },
                text: { role: "hook", body: hook },
              },
              ...Array.from({ length: items }, (_, i) => ({
                id: `item-${i + 1}`,
                item_number: i + 1,
                background: { shot_id: `asset-${i + 1}` },
                text: { role: "beat", body: `Item ${i + 1}` },
              })),
              ...(cta
                ? [
                    {
                      id: "cta",
                      background: { shot_id: "asset-cta" },
                      text: { role: "cta", body: "Try it" },
                    },
                  ]
                : []),
            ],
          },
        },
      },
    ],
  };
}

function errors(input: unknown): string[] {
  return validateManifest(input).issues.map((issue) => issue.code);
}

test("five promised items yield six slides, with an optional seventh CTA", () => {
  for (const cta of [false, true]) {
    const result = validateManifest(fixture(5, cta));
    assert.equal(result.valid, true);
    if (result.valid)
      assert.equal(at(result.manifest.posts, 0).factors.composition.slides.length, cta ? 7 : 6);
  }
  assert.equal(validateManifest(fixture(8)).valid, true);
});

test("missing and reordered items fail with paths for repair", () => {
  const input = fixture();
  at(input.posts, 0).factors.composition.slides.splice(2, 1);
  assert.ok(errors(input).includes("promise_count_mismatch"));
  assert.ok(errors(input).includes("item_sequence_mismatch"));
  assert.ok(validateManifest(input).issues.every((issue) => issue.path.startsWith("posts[0]")));
});

test("story posts have variable lengths and no numbered promise", () => {
  const input = fixture(3);
  Reflect.deleteProperty(at(input.posts, 0), "promised_items");
  for (const slide of at(input.posts, 0).factors.composition.slides)
    Reflect.deleteProperty(slide, "item_number");
  assert.equal(validateManifest(input).valid, true);
});

test("duplicate identifiers, missing assets, and agent placement fail", () => {
  const input = fixture();
  const slides = at(input.posts, 0).factors.composition.slides;
  at(slides, 1).id = "cover";
  Object.assign(at(slides, 1), { background: {} });
  Object.assign(at(slides, 1).text, { position: "lower" });
  assert.deepEqual(errors(input), [
    "duplicate_id",
    "one_asset_reference_required",
    "placement_owned_by_production",
  ]);
});

test("asset references are exclusive and remote URLs require HTTPS", () => {
  for (const background of [
    { url: "file:///etc/passwd" },
    { url: "https://user:pass@example.com/a.png" },
    { shot_id: "a", url: "https://example.com/a.png" },
  ]) {
    const input = fixture();
    Object.assign(at(at(input.posts, 0).factors.composition.slides, 1), { background });
    assert.ok(errors(input).includes("one_asset_reference_required"));
  }
});

test("invalid input never passes or throws", () => {
  for (const input of [
    null,
    [],
    1,
    "x",
    {},
    { version: 1, posts: [null] },
    {
      version: 1,
      request_key: "a",
      posts: [{ factors: { composition: { slides: [null, null] } } }],
    },
  ]) {
    assert.equal(validateManifest(input).valid, false);
  }
});

test("cover-only and cover-plus-CTA posts fail", () => {
  assert.ok(errors(fixture(0)).includes("cover_and_content_required"));
  assert.ok(errors(fixture(0, true)).includes("content_required"));
});

test("cover copy must match the tracked hook", () => {
  const input = fixture();
  at(input.posts, 0).factors.hook_text = "Different hook";
  assert.ok(errors(input).includes("hook_mismatch"));
});
