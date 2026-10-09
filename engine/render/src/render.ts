import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { type Factors, loadShots, paths, publicUrl } from "@latere/core";
import sharp from "sharp";
import { renderPhoto } from "./photo";

const MAX_ASSET_BYTES = 25 * 1024 * 1024;

async function readAsset(source: string): Promise<Buffer> {
  const url = new URL(source);
  const configured = publicUrl("");
  const base = new URL(configured);
  const prefix = `${base.pathname.replace(/\/+$/, "")}/`;
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.origin !== base.origin ||
    !url.pathname.startsWith(prefix)
  ) {
    throw new Error("Render assets must be hosted under Latere Supabase media bucket");
  }
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error(`Asset fetch failed: ${response.status}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_ASSET_BYTES) throw new Error("Asset exceeds 25 MiB");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}

export async function renderSlideshow(id: string, factors: Factors) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid render ID");
  const slides = factors.composition?.slides;
  if (!slides?.length) throw new Error("Photo slides are required; video rendering was removed");
  if (factors.aspect !== undefined && factors.aspect !== "9:16" && factors.aspect !== "4:5")
    throw new Error("Unsupported aspect ratio");
  if (factors.slide_count !== undefined && factors.slide_count !== slides.length)
    throw new Error("Slide count mismatch");
  const shots = slides.some((slide) => slide.background.shot_id) ? await loadShots() : [];
  const byId = new Map(shots.map((shot) => [shot.id, shot.url]));
  const sources = slides.map((slide, i) => {
    const source = slide.background.url ?? byId.get(slide.background.shot_id ?? "");
    if (!source) throw new Error(`Slide ${i + 1}: missing background`);
    if (!slide.text?.body.trim()) throw new Error(`Slide ${i + 1}: missing text`);
    if (slide.overlays?.length)
      throw new Error(`Slide ${i + 1}: image overlays require a validated layout`);
    return source;
  });
  const root = paths().renderOut;
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, `${id}-`));
  const outputs: string[] = [];
  const reports = [];
  const assets = new Map<string, Buffer>();
  try {
    for (const [i, slide] of slides.entries()) {
      const source = sources[i];
      if (!source || !slide.text) throw new Error("Incomplete slide");
      const background = assets.get(source) ?? (await readAsset(source));
      assets.set(source, background);
      const photo = await renderPhoto(background, {
        body: slide.text.body,
        role: slide.text.role ?? "beat",
        aspect: factors.aspect ?? "9:16",
        brand: process.env.LATERE_BRAND ?? "@getnonyxa",
      });
      const file = join(directory, `slide_${String(i + 1).padStart(2, "0")}.png`);
      await writeFile(file, photo.png);
      const output = await sharp(file).metadata();
      if (
        output.format !== "png" ||
        output.width !== photo.report.width ||
        output.height !== photo.report.height
      )
        throw new Error(`Slide ${i + 1}: output validation failed`);
      outputs.push(file);
      reports.push({
        source,
        sha256: createHash("sha256").update(background).digest("hex"),
        ...photo.report,
      });
    }
    const render_spec = {
      engine: "sharp",
      version: 1,
      slides: reports,
      subject_analysis: "not_run",
      human_review_required: true,
    };
    await writeFile(join(directory, "report.json"), JSON.stringify(render_spec, null, 2));
    return { paths: outputs, render_spec };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function removeSupersededRender(
  id: string,
  previous: string | undefined,
  current: string | undefined,
): Promise<void> {
  if (!previous || !current || !/^[a-zA-Z0-9_-]+$/.test(id)) return;
  const root = resolve(paths().renderOut);
  const oldPath = resolve(previous);
  const newPath = resolve(current);
  const attempt = new RegExp(`^${id}-[a-zA-Z0-9]{6}$`);
  if (
    oldPath === newPath ||
    dirname(oldPath) !== root ||
    dirname(newPath) !== root ||
    !attempt.test(basename(oldPath)) ||
    !attempt.test(basename(newPath))
  )
    return;
  try {
    await rm(oldPath, { recursive: true, force: true });
  } catch (error) {
    console.warn(`[render] Could not remove superseded render ${oldPath}: ${String(error)}`);
  }
}
