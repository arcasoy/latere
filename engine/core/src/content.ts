import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { paths } from "./paths";
import { readRecords } from "./supabase";
import type { AppScreen, Clip, Format, Hook, Role, ShotType, Tag } from "./types";

function loadList<T>(filename: string, key: string): T[] {
  const file = join(paths().content, filename);
  if (!existsSync(file)) return [];
  const doc = (parse(readFileSync(file, "utf8")) ?? {}) as Record<string, unknown>;
  const list = doc[key];
  return Array.isArray(list) ? (list as T[]) : [];
}

export async function loadHooks(): Promise<Hook[]> {
  return [...loadList<Hook>("hooks.yaml", "hooks"), ...(await readRecords<Hook>("hooks"))];
}

export function loadAppScreens(): AppScreen[] {
  return loadList<AppScreen>("app-screens.yaml", "app_screens");
}

export function loadTags(): Tag[] {
  return loadList<Tag>("shot-tags.yaml", "tags");
}

export function loadRoles(): Role[] {
  return loadList<Role>("roles.yaml", "roles");
}

export function loadFormats(): Format[] {
  return loadList<Format>("formats.yaml", "formats");
}

export function loadShotTypes(): ShotType[] {
  return loadList<ShotType>("shot-types.yaml", "shot_types");
}

export function loadClips(): Clip[] {
  return loadList<Clip>("clips.yaml", "clips");
}
