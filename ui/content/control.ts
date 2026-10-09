export interface ControlState {
  autonomous: boolean;
  mode: string;
  intervalSec: number;
  phase: "off" | "running" | "waiting";
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastSummary: string;
  needsInput: boolean;
  prompt: string | null;
  posts: number;
  openRequests: number;
  pendingReview?: number;
  log?: { t: number; s: string }[];
}

export async function getState(): Promise<ControlState | null> {
  try {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as ControlState;
  } catch {
    return null;
  }
}

export async function toggleAutonomous(on: boolean): Promise<ControlState | null> {
  try {
    const r = await fetch("/api/toggle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ on }),
    });
    if (!r.ok) return null;
    return (await r.json()) as ControlState;
  } catch {
    return null;
  }
}

import type { Shot } from "./types";

export async function getShots(): Promise<Shot[]> {
  try {
    const r = await fetch("/api/shots", { cache: "no-store" });
    if (!r.ok) return [];
    return (await r.json()) as Shot[];
  } catch {
    return [];
  }
}

export async function setShotTags(id: string, tags: string[]): Promise<Shot | null> {
  try {
    const r = await fetch("/api/shots/tag", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, tags }),
    });
    if (!r.ok) return null;
    return (await r.json()) as Shot;
  } catch {
    return null;
  }
}

export async function deleteShot(id: string): Promise<boolean> {
  try {
    const r = await fetch("/api/shots/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!r.ok) return false;
    const d = (await r.json()) as { ok?: boolean };
    return Boolean(d.ok);
  } catch {
    return false;
  }
}

export async function uploadShot(
  file: File,
  tags: string[],
  appScreen?: string,
): Promise<Shot | null> {
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
  const qs = new URLSearchParams({ tags: tags.join(","), ext });
  if (appScreen) qs.set("appScreen", appScreen);
  try {
    const r = await fetch(`/api/shots/upload?${qs.toString()}`, {
      method: "POST",
      headers: { "content-type": file.type || "video/mp4" },
      body: file,
    });
    if (!r.ok) return null;
    return (await r.json()) as Shot;
  } catch {
    return null;
  }
}

export interface RenderItem {
  kind?: "video" | "slideshow";
  key: string;
  url: string | null;
  urls?: (string | null)[];
  id: string;
  lastModified?: string | null;
  size?: number | null;
  format?: string | null;
  hookText?: string | null;
  status?: string | null;
  channel?: string | null;
}

export async function getRenders(): Promise<RenderItem[]> {
  try {
    const r = await fetch("/api/renders", { cache: "no-store" });
    if (!r.ok) return [];
    return (await r.json()) as RenderItem[];
  } catch {
    return [];
  }
}

export async function deleteRender(key: string): Promise<boolean> {
  try {
    const r = await fetch("/api/renders/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    });
    if (!r.ok) return false;
    const d = (await r.json()) as { ok?: boolean };
    return Boolean(d.ok);
  } catch {
    return false;
  }
}

export async function deletePost(id: string): Promise<boolean> {
  try {
    const r = await fetch("/api/posts/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!r.ok) return false;
    const d = (await r.json()) as { ok?: boolean };
    return Boolean(d.ok);
  } catch {
    return false;
  }
}

export interface ReviewResult {
  ok: boolean;
  error?: string;
  regen?: string;
}

async function postJson(path: string, payload: unknown): Promise<ReviewResult> {
  try {
    const r = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await r.json()) as ReviewResult;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function approvePost(id: string): Promise<ReviewResult> {
  return postJson("/api/posts/approve", { id });
}

export function rejectPost(id: string, reason?: string): Promise<ReviewResult> {
  return postJson("/api/posts/reject", { id, reason: reason ?? "" });
}

export function regenPost(id: string, reason?: string): Promise<ReviewResult> {
  return postJson("/api/posts/regen", { id, reason: reason ?? "" });
}

export function generateOne(): Promise<ReviewResult> {
  return postJson("/api/generate", {});
}

export interface LinkResult {
  ok: boolean;
  linked?: string[];
  error?: string;
}

export async function linkPost(id: string): Promise<LinkResult> {
  try {
    const r = await fetch("/api/posts/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    return (await r.json()) as LinkResult;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
