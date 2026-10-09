import { basename, extname } from "node:path";
import { addShot } from "./catalog";
import { newId, nowIso } from "./ids";
import { probeMedia } from "./probe";
import { isStorageConfigured, uploadFile } from "./storage";
import type { Shot } from "./types";

export interface IngestOpts {
  tags: string[];
  appScreen?: string;
  source?: string;
  notes?: string;
}

const IMAGE_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

function contentTypeFor(ext: string): { contentType: string; kind: "video" | "image" } {
  const img = IMAGE_EXT[ext.toLowerCase()];
  if (img) return { contentType: img, kind: "image" };
  return {
    contentType: ext.toLowerCase() === ".mov" ? "video/quicktime" : "video/mp4",
    kind: "video",
  };
}

export async function ingestShot(localPath: string, opts: IngestOpts): Promise<Shot> {
  if (!isStorageConfigured())
    throw new Error(
      "Supabase not configured — set LATERE_SUPABASE_URL and LATERE_SUPABASE_SECRET_KEY",
    );
  const id = newId("sh");
  const ext = extname(localPath) || ".mp4";
  const { contentType, kind } = contentTypeFor(ext);
  const key = `raw/${id}${ext}`;
  const url = await uploadFile(localPath, key, contentType);
  if (!url) throw new Error("upload failed");

  const info = await probeMedia(localPath);
  const shot: Shot = {
    id,
    key,
    url,
    kind,
    tags: opts.tags,
    ...(opts.appScreen ? { app_screen: opts.appScreen } : {}),
    ...(info.durationS != null ? { duration_s: Math.round(info.durationS * 10) / 10 } : {}),
    ...(info.orientation ? { orientation: info.orientation } : {}),
    ...(info.hasAudio != null ? { has_audio: info.hasAudio } : {}),
    source: opts.source ?? basename(localPath),
    ...(opts.notes ? { notes: opts.notes } : {}),
    created_at: nowIso(),
  };
  await addShot(shot);
  return shot;
}
