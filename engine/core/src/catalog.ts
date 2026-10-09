import { deleteObject } from "./storage";
import { deleteRecord, readRecords, writeRecord } from "./supabase";
import type { Shot } from "./types";

export async function loadShots(): Promise<Shot[]> {
  return readRecords<Shot>("shots");
}

export async function addShot(shot: Shot): Promise<void> {
  await writeRecord("shots", shot);
}

export async function updateShotTags(id: string, tags: string[]): Promise<Shot | null> {
  const shot = (await loadShots()).find((s) => s.id === id);
  if (!shot) return null;
  shot.tags = tags;
  await writeRecord("shots", shot);
  return shot;
}

export async function deleteShot(id: string): Promise<boolean> {
  const shot = (await loadShots()).find((s) => s.id === id);
  if (!shot) return false;
  await deleteObject(shot.key);
  return deleteRecord("shots", id);
}

export function shotKind(s: Shot): "video" | "image" {
  if (s.kind) return s.kind;
  return /\.(png|jpe?g|webp|gif)$/i.test(s.key) ? "image" : "video";
}

export function isPhotoBackground(s: Shot): boolean {
  return shotKind(s) === "image" && /\.(png|jpe?g|webp|avif)$/i.test(s.key);
}

export function matchShots(
  shots: readonly Shot[],
  wantTags: readonly string[],
  appScreen?: string,
  kind?: "video" | "image",
): Shot[] {
  return shots.filter((s) => {
    if (kind && shotKind(s) !== kind) return false;
    if (appScreen && s.app_screen !== appScreen) return false;
    if (wantTags.length === 0) return true;
    return s.tags.some((t) => wantTags.includes(t));
  });
}
