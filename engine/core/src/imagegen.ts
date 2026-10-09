import { existsSync, readFileSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { isPhotoBackground, loadShots } from "./catalog";
import { ingestShot } from "./ingest";
import { generateImage, hasImageGen } from "./llm";
import { paths } from "./paths";
import { isStorageConfigured } from "./storage";
import type { Shot } from "./types";

export interface ImagePrompt {
  id: string;
  tags: string[];
  prompt: string;
}

const STYLE_SUFFIX =
  " Vertical 9:16 composition, photorealistic. " +
  "No text, no words, no watermarks, no logos anywhere in the image.";

export function loadImagePrompts(): ImagePrompt[] {
  const file = join(paths().content, "image-prompts.yaml");
  if (!existsSync(file)) return [];
  const doc = (parse(readFileSync(file, "utf8")) ?? {}) as { prompts?: ImagePrompt[] };
  return Array.isArray(doc.prompts) ? doc.prompts : [];
}

function num(env: string, fallback: number): number {
  const v = Number(process.env[env]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const SOURCE_PREFIX = "imagegen:";

function generatedToday(shots: readonly Shot[]): number {
  const today = new Date().toISOString().slice(0, 10);
  return shots.filter(
    (s) => s.source?.startsWith(SOURCE_PREFIX) && s.created_at.slice(0, 10) === today,
  ).length;
}

export interface PoolResult {
  poolSize: number;
  generated: number;
  skipped?: string;
}

export async function ensureBackgroundPool(): Promise<PoolResult> {
  const shots = await loadShots();
  const images = shots.filter(isPhotoBackground);
  const min = num("LATERE_IMAGE_POOL_MIN", 8);
  const cap = num("LATERE_IMAGE_DAILY_CAP", 12);

  if (images.length >= min) return { poolSize: images.length, generated: 0 };
  if (!hasImageGen() || !isStorageConfigured()) {
    return {
      poolSize: images.length,
      generated: 0,
      skipped: "image gen or Supabase not configured",
    };
  }
  const prompts = loadImagePrompts();
  if (prompts.length === 0) {
    return {
      poolSize: images.length,
      generated: 0,
      skipped: "no prompts in content/image-prompts.yaml",
    };
  }

  const budget = Math.max(0, cap - generatedToday(shots));
  const want = Math.min(min - images.length, budget);
  if (want === 0) {
    return { poolSize: images.length, generated: 0, skipped: `daily image cap (${cap}) reached` };
  }

  const generated = await generateBackgrounds(want, images.length);
  return { poolSize: images.length + generated, generated };
}

export async function generateBackgrounds(count: number, offset = 0): Promise<number> {
  const prompts = loadImagePrompts();
  if (prompts.length === 0 || count <= 0) return 0;
  let generated = 0;
  for (let i = 0; i < count; i++) {
    const p = prompts[(offset + i) % prompts.length]!;
    try {
      const img = await generateImage(p.prompt + STYLE_SUFFIX);
      const tmp = join(tmpdir(), `latere-gen-${Date.now()}-${i}.${img.ext}`);
      await writeFile(tmp, img.data);
      try {
        const shot = await ingestShot(tmp, {
          tags: [...new Set(["ai-gen", "background", ...p.tags])],
          source: `${SOURCE_PREFIX}${p.id}`,
        });
        generated++;
        console.log(`[imagegen] ${shot.id} <- ${p.id} tags=[${shot.tags.join(",")}]`);
      } finally {
        await rm(tmp, { force: true });
      }
    } catch (e) {
      console.warn(`[imagegen] ${p.id} failed: ${(e as Error).message}`);
    }
  }
  return generated;
}
