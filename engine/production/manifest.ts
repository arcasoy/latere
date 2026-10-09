import type { Factors, Slide } from "../core/src/types";

interface ProductionSlide extends Slide {
  id: string;
  item_number?: number;
}

interface ProductionPost {
  id: string;
  template_version: string;
  promised_items?: number;
  factors: Pick<Factors, "hook_text" | "aspect" | "used_tags" | "slide_count"> & {
    composition: { format: string; segments: []; slides: ProductionSlide[] };
  };
}

interface ProductionManifest {
  version: 1;
  request_key: string;
  posts: ProductionPost[];
}

interface Issue {
  path: string;
  code: string;
}

type ValidationResult =
  | { valid: true; manifest: ProductionManifest; issues: [] }
  | { valid: false; issues: Issue[] };

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function httpsUrl(value: unknown): boolean {
  if (!text(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validateManifest(input: unknown): ValidationResult {
  const issues: Issue[] = [];
  const expectCondition = (condition: boolean, path: string, code: string): void => {
    if (!condition) issues.push({ path, code });
  };
  if (!object(input)) return { valid: false, issues: [{ path: "$", code: "object_required" }] };
  expectCondition(input.version === 1, "version", "unsupported_version");
  expectCondition(text(input.request_key), "request_key", "required");
  if (!Array.isArray(input.posts) || input.posts.length === 0) {
    return { valid: false, issues: [...issues, { path: "posts", code: "posts_required" }] };
  }
  const postIds = new Set<string>();
  input.posts.forEach((post: unknown, p: number) => {
    const path = `posts[${p}]`;
    if (!object(post)) {
      expectCondition(false, path, "object_required");
      return;
    }
    expectCondition(text(post.id), `${path}.id`, "required");
    if (text(post.id)) {
      expectCondition(!postIds.has(post.id), `${path}.id`, "duplicate_id");
      postIds.add(post.id);
    }
    expectCondition(text(post.template_version), `${path}.template_version`, "required");
    const promised = post.promised_items;
    expectCondition(
      promised === undefined || positiveInteger(promised),
      `${path}.promised_items`,
      "positive_integer_required",
    );
    const factors = post.factors;
    if (!object(factors)) {
      expectCondition(false, `${path}.factors`, "object_required");
      return;
    }
    expectCondition(text(factors.hook_text), `${path}.factors.hook_text`, "required");
    expectCondition(
      factors.aspect === "9:16" || factors.aspect === "4:5",
      `${path}.factors.aspect`,
      "unsupported_aspect",
    );
    expectCondition(
      Array.isArray(factors.used_tags) && factors.used_tags.every(text),
      `${path}.factors.used_tags`,
      "tags_required",
    );
    const composition = factors.composition;
    if (!object(composition)) {
      expectCondition(false, `${path}.factors.composition`, "object_required");
      return;
    }
    expectCondition(text(composition.format), `${path}.factors.composition.format`, "required");
    expectCondition(
      Array.isArray(composition.segments) && composition.segments.length === 0,
      `${path}.factors.composition.segments`,
      "photo_post_requires_empty_segments",
    );
    const slides = composition.slides;
    const slidePath = `${path}.factors.composition.slides`;
    if (!Array.isArray(slides) || slides.length < 2) {
      expectCondition(false, slidePath, "cover_and_content_required");
      return;
    }
    expectCondition(
      factors.slide_count === undefined || factors.slide_count === slides.length,
      `${path}.factors.slide_count`,
      "slide_count_mismatch",
    );
    const slideIds = new Set<string>();
    let contentCount = 0;
    slides.forEach((slide: unknown, s: number) => {
      const at = `${slidePath}[${s}]`;
      if (!object(slide)) {
        expectCondition(false, at, "object_required");
        return;
      }
      expectCondition(text(slide.id), `${at}.id`, "required");
      if (text(slide.id)) {
        expectCondition(!slideIds.has(slide.id), `${at}.id`, "duplicate_id");
        slideIds.add(slide.id);
      }
      const background = slide.background;
      expectCondition(
        object(background) &&
          ((text(background.shot_id) && background.url === undefined) ||
            (background.shot_id === undefined && httpsUrl(background.url))),
        `${at}.background`,
        "one_asset_reference_required",
      );
      const copy = slide.text;
      if (!object(copy)) {
        expectCondition(false, `${at}.text`, "object_required");
        return;
      }
      expectCondition(text(copy.body), `${at}.text.body`, "required");
      const role = copy.role;
      expectCondition(
        s === 0 ? role === "hook" : role === "beat" || (role === "cta" && s === slides.length - 1),
        `${at}.text.role`,
        "invalid_sequence",
      );
      if (s === 0)
        expectCondition(copy.body === factors.hook_text, `${at}.text.body`, "hook_mismatch");
      expectCondition(
        copy.position === undefined,
        `${at}.text.position`,
        "placement_owned_by_production",
      );
      expectCondition(
        slide.overlays === undefined ||
          (Array.isArray(slide.overlays) && slide.overlays.length === 0),
        `${at}.overlays`,
        "overlays_not_supported",
      );
      if (role === "beat") {
        contentCount++;
        expectCondition(
          promised === undefined
            ? slide.item_number === undefined
            : slide.item_number === contentCount,
          `${at}.item_number`,
          "item_sequence_mismatch",
        );
      } else {
        expectCondition(slide.item_number === undefined, `${at}.item_number`, "content_items_only");
      }
    });
    expectCondition(contentCount > 0, slidePath, "content_required");
    if (positiveInteger(promised))
      expectCondition(contentCount === promised, slidePath, "promise_count_mismatch");
  });
  if (issues.length) return { valid: false, issues };
  return { valid: true, manifest: input as unknown as ProductionManifest, issues: [] };
}
