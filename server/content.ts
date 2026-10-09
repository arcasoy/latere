import { rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collect } from "@latere/collect";
import {
  appendLearned,
  deleteObject,
  deleteShot,
  getObjectBuffer,
  ingestShot,
  type LedgerRecord,
  listObjects,
  loadAppScreens,
  loadFormats,
  loadRoles,
  loadShots,
  loadTags,
  mergePublishInstances,
  publicUrl,
  readLedger,
  readRequests,
  removeLedger,
  updateShotTags,
  upsertLedger,
} from "@latere/core";
import { findBufferInstances, type PublishMode, publishVariant } from "@latere/publish";
import { runIteration } from "../engine/loop";

type Phase = "off" | "running" | "waiting";

interface State {
  autonomous: boolean;
  mode: PublishMode;
  intervalSec: number;
  phase: Phase;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastSummary: string;
  needsInput: boolean;
  prompt: string | null;
}

const state: State = {
  autonomous: false,
  mode: (process.env.LATERE_PUBLISH_MODE as PublishMode) || "draft",
  intervalSec: Number(process.env.LATERE_INTERVAL_SEC ?? "60"),
  phase: "off",
  nextRunAt: null,
  lastRunAt: null,
  lastSummary: "",
  needsInput: false,
  prompt: null,
};

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

interface LogLine {
  t: number;
  s: string;
}
const logBuf: LogLine[] = [];
function pushLog(raw: string): void {
  for (const line of raw.split("\n")) {
    const s = line.replace(/\[[0-9;]*m/g, "").trimEnd();
    if (!s) continue;
    logBuf.push({ t: Date.now(), s: s.slice(0, 300) });
  }
  if (logBuf.length > 400) logBuf.splice(0, logBuf.length - 400);
}

export function captureConsole(): void {
  const ol = console.log.bind(console);
  const ow = console.warn.bind(console);
  console.log = (...a: unknown[]) => {
    ol(...a);
    pushLog(a.map((x) => String(x)).join(" "));
  };
  console.warn = (...a: unknown[]) => {
    ow(...a);
    pushLog(a.map((x) => String(x)).join(" "));
  };
}

async function counts() {
  const ledger = await readLedger();
  return {
    posts: ledger.length,
    openRequests: (await readRequests()).filter((r) => r.status === "open").length,
    pendingReview: ledger.filter((r) => r.status === "review").length,
  };
}

async function snapshot() {
  return { ...state, ...(await counts()), log: logBuf.slice(-100) };
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  if (!state.autonomous) return;
  const delay = Math.max(0, (state.nextRunAt ?? Date.now()) - Date.now());
  timer = setTimeout(() => void tick(), delay);
}

async function tick(): Promise<void> {
  if (running || !state.autonomous) return;
  running = true;
  state.phase = "running";
  console.log("[content] tick — deciding + composing a batch…");
  try {
    const res = await runIteration({ render: true, batchSize: 4 });
    await collect();
    state.lastSummary = res.summary;
    const hi = (await readRequests()).filter((r) => r.status === "open" && r.priority >= 3).length;
    const reviews = (await readLedger()).filter((r) => r.status === "review").length;
    const prompts: string[] = [];
    if (reviews > 0) prompts.push(`${reviews} post${reviews === 1 ? "" : "s"} waiting for review.`);
    if (hi > 0) {
      prompts.push(`${hi} high-priority shot${hi === 1 ? "" : "s"} to film — see the Shot Queue.`);
    }
    state.needsInput = prompts.length > 0;
    state.prompt = prompts.length > 0 ? prompts.join(" ") : null;
    console.log(
      `[content] tick: ${res.summary}${reviews > 0 ? ` · ${reviews} awaiting review` : ""}${
        hi > 0 ? ` · needs ${hi} shot(s)` : ""
      }`,
    );
  } catch (e) {
    state.lastSummary = `error: ${(e as Error).message}`;
    console.warn(`[content] tick error: ${(e as Error).message}`);
  } finally {
    running = false;
    state.lastRunAt = Date.now();
    if (state.autonomous) {
      state.phase = "waiting";
      state.nextRunAt = Date.now() + state.intervalSec * 1000;
      schedule();
    } else {
      state.phase = "off";
      state.nextRunAt = null;
    }
  }
}

function startIteration(): boolean {
  if (running) return false;
  running = true;
  state.phase = "running";
  void (async () => {
    try {
      const r = await runIteration({
        render: true,
        batchSize: 4,
        maxRenders: 1,
      });
      state.lastSummary = r.summary;
      console.log(`[content] generate: ${r.summary}`);
    } catch (e) {
      state.lastSummary = `error: ${(e as Error).message}`;
      console.warn(`[content] generate failed: ${(e as Error).message}`);
    } finally {
      running = false;
      state.lastRunAt = Date.now();
      state.phase = state.autonomous ? "waiting" : "off";
      if (state.autonomous) {
        state.nextRunAt = Date.now() + state.intervalSec * 1000;
        schedule();
      }
    }
  })();
  return true;
}

function setAutonomous(on: boolean): void {
  if (on === state.autonomous) return;
  state.autonomous = on;
  console.log(`[content] autonomous ${on ? "ON — starting…" : "OFF — paused"}`);
  if (on) {
    state.phase = "running";
    state.nextRunAt = null;
    void tick();
  } else {
    if (timer) clearTimeout(timer);
    timer = null;
    state.phase = "off";
    state.nextRunAt = null;
    state.needsInput = false;
    state.prompt = null;
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => resolve(body));
  });
}

function readBodyBuffer(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function field(req: IncomingMessage, name: string): Promise<string> {
  return (await fields(req, name))[name] ?? "";
}

async function fields(req: IncomingMessage, ...names: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const parsed = JSON.parse((await readBody(req)) || "{}") as Record<string, unknown>;
    for (const name of names) out[name] = String(parsed[name] ?? "");
  } catch {
    for (const name of names) out[name] = "";
  }
  return out;
}

function sendJson(res: ServerResponse, data: unknown): void {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

function variantIdFromKey(key: string): string {
  return key
    .replace(/^renders\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.[^.]+$/, "");
}

async function deleteRenderObjects(id: string): Promise<void> {
  const keys = [`renders/${id}.mp4`, ...(await listObjects(`renders/${id}/`)).map((o) => o.key)];
  for (const key of keys) {
    if (key.startsWith("raw/") || key === "index.json") continue;
    try {
      await deleteObject(key);
    } catch {}
  }
}

async function deleteVariant(opts: { id?: string; key?: string }): Promise<boolean> {
  const id = opts.id ?? (opts.key ? variantIdFromKey(opts.key) : "");
  if (!id) return false;
  await deleteRenderObjects(id);
  await removeLedger(id);
  console.log(`[content] deleted variant ${id} (post + render)`);
  return true;
}

async function rejectVariant(id: string, reason?: string): Promise<LedgerRecord | null> {
  const rec = (await readLedger()).find((r) => r.id === id);
  if (!rec) return null;
  await deleteRenderObjects(id);
  const render = rec.render ? { ...rec.render } : undefined;
  if (render) {
    delete render.url;
    delete render.urls;
  }
  const why = reason?.trim();
  const updated: LedgerRecord = {
    ...rec,
    status: "rejected",
    ...(render ? { render } : {}),
    ...(why ? { rejected_reason: why } : {}),
  };
  await upsertLedger(updated);
  if (why && (await appendLearned(why))) console.log(`[content] lesson learned: "${why}"`);
  console.log(
    `[content] rejected ${id}${why ? ` — "${why}"` : ""} (kept as negative signal, render files deleted)`,
  );
  return updated;
}

async function approveVariant(
  id: string,
): Promise<{ ok: boolean; error?: string; record?: LedgerRecord }> {
  const rec = (await readLedger()).find((r) => r.id === id);
  if (!rec) return { ok: false, error: "post not found" };
  if (rec.status !== "review") return { ok: false, error: `post is ${rec.status}, not in review` };
  const updated = await publishVariant(rec, { mode: state.mode });
  const real = (updated.publishes ?? []).some(
    (p) => p.buffer_post_id && !p.buffer_post_id.startsWith("dryrun_"),
  );
  if (!real) {
    await upsertLedger({ ...updated, status: "review" });
    return {
      ok: false,
      error: "nothing went out (channel caps / missing token) — still in review",
    };
  }
  console.log(
    `[content] approved ${id} -> ${state.mode} (${(updated.publishes ?? [])
      .map((p) => p.channel)
      .join(", ")})`,
  );
  return { ok: true, record: updated };
}

async function renderIndex() {
  const objs = await listObjects("renders/");
  const byId = new Map((await readLedger()).map((r) => [r.id, r]));
  const meta = (id: string) => {
    const rec = byId.get(id);
    return {
      format: rec?.factors?.composition?.format ?? rec?.factors?.format ?? null,
      hookText: rec?.factors?.hook_text ?? null,
      status: rec?.status ?? null,
      channel: rec?.publish?.channel ?? null,
    };
  };

  const videos = objs
    .filter((o) => /^renders\/[^/]+\.(mp4|mov)$/.test(o.key))
    .map((o) => {
      const id = variantIdFromKey(o.key);
      return {
        kind: "video" as const,
        key: o.key,
        url: publicUrl(o.key),
        id,
        lastModified: o.lastModified ?? null,
        size: o.size ?? null,
        ...meta(id),
      };
    });

  const slideGroups = new Map<string, typeof objs>();
  for (const o of objs) {
    if (!/^renders\/[^/]+\/slide_\d+\.(png|jpe?g|webp)$/.test(o.key)) continue;
    const id = variantIdFromKey(o.key);
    const g = slideGroups.get(id) ?? [];
    g.push(o);
    slideGroups.set(id, g);
  }
  const slideshows = [...slideGroups.entries()].map(([id, slides]) => {
    const sorted = [...slides].sort((a, b) => a.key.localeCompare(b.key));
    const first = sorted[0] as (typeof sorted)[number];
    return {
      kind: "slideshow" as const,
      key: `renders/${id}/`,
      url: publicUrl(first.key),
      urls: sorted.map((s) => publicUrl(s.key)),
      id,
      lastModified: first.lastModified ?? null,
      size: sorted.reduce((acc, s) => acc + (s.size ?? 0), 0),
      ...meta(id),
    };
  });

  return [...videos, ...slideshows].sort((a, b) =>
    String(b.lastModified ?? "").localeCompare(String(a.lastModified ?? "")),
  );
}

export async function contentRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const post = req.method === "POST";

  if (url.pathname === "/api/state") {
    sendJson(res, await snapshot());
    return true;
  }

  if (url.pathname === "/api/data") {
    sendJson(res, {
      ledger: await readLedger(),
      requests: await readRequests(),
      tags: loadTags(),
      roles: loadRoles(),
      formats: loadFormats(),
      appScreens: loadAppScreens(),
    });
    return true;
  }

  if (url.pathname === "/api/shots") {
    sendJson(res, await loadShots());
    return true;
  }

  if (url.pathname === "/api/shots/tag" && post) {
    let id = "";
    let tags: string[] = [];
    try {
      const p = JSON.parse((await readBody(req)) || "{}") as { id?: unknown; tags?: unknown };
      id = String(p.id ?? "");
      tags = Array.isArray(p.tags) ? p.tags.map(String) : [];
    } catch {}
    const shot = await updateShotTags(id, tags);
    sendJson(res, shot ?? { error: "not found" });
    return true;
  }

  if (url.pathname === "/api/shots/upload" && post) {
    const tags = (url.searchParams.get("tags") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const appScreen = url.searchParams.get("appScreen") || undefined;
    const ext = (url.searchParams.get("ext") ?? "mp4").replace(/[^a-z0-9]/gi, "") || "mp4";
    const buf = await readBodyBuffer(req);
    const tmp = join(tmpdir(), `gtm-up-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`);
    await writeFile(tmp, buf);
    try {
      const shot = await ingestShot(tmp, { tags, ...(appScreen ? { appScreen } : {}) });
      sendJson(res, shot);
    } finally {
      await rm(tmp, { force: true });
    }
    return true;
  }

  if (url.pathname === "/api/shots/delete" && post) {
    sendJson(res, { ok: await deleteShot(await field(req, "id")) });
    return true;
  }

  if (url.pathname === "/api/renders") {
    sendJson(res, await renderIndex());
    return true;
  }

  if (url.pathname === "/api/renders/download") {
    const key = url.searchParams.get("key") ?? "";
    if (!key.startsWith("renders/")) {
      res.writeHead(400);
      res.end("bad key");
      return true;
    }
    const buf = await getObjectBuffer(key);
    if (!buf) {
      res.writeHead(404);
      res.end("not found");
      return true;
    }
    const filename = key.split("/").pop() || "slide.png";
    res.writeHead(200, {
      "content-type": key.endsWith(".png") ? "image/png" : "application/octet-stream",
      "content-disposition": `attachment; filename="${filename}"`,
    });
    res.end(Buffer.from(buf));
    return true;
  }

  if (url.pathname === "/api/renders/delete" && post) {
    const key = await field(req, "key");
    if (!key || key.startsWith("raw/") || key === "index.json") sendJson(res, { ok: false });
    else sendJson(res, { ok: await deleteVariant({ key }) });
    return true;
  }

  if (url.pathname === "/api/posts/delete" && post) {
    const id = await field(req, "id");
    sendJson(res, { ok: id ? await deleteVariant({ id }) : false });
    return true;
  }

  if (url.pathname === "/api/generate" && post) {
    sendJson(
      res,
      startIteration()
        ? { ok: true, started: true }
        : { ok: false, error: "already running — watch the terminal" },
    );
    return true;
  }

  if (url.pathname === "/api/posts/approve" && post) {
    sendJson(res, await approveVariant(await field(req, "id")));
    return true;
  }

  if (url.pathname === "/api/posts/reject" && post) {
    const { id, reason } = await fields(req, "id", "reason");
    const rec = await rejectVariant(id as string, reason);
    sendJson(res, rec ? { ok: true, record: rec } : { ok: false, error: "post not found" });
    return true;
  }

  if (url.pathname === "/api/posts/regen" && post) {
    const { id, reason } = await fields(req, "id", "reason");
    const rec = await rejectVariant(id as string, reason);
    if (!rec) {
      sendJson(res, { ok: false, error: "post not found" });
      return true;
    }
    sendJson(res, {
      ok: true,
      rejected: true,
      regen: startIteration()
        ? "replacement generating — watch the terminal"
        : "loop busy — replacement on the next tick",
    });
    return true;
  }

  if (url.pathname === "/api/posts/link" && post) {
    const id = await field(req, "id");
    const rec = (await readLedger()).find((r) => r.id === id);
    if (!rec) {
      sendJson(res, { ok: false, error: "post not found" });
      return true;
    }
    try {
      const found = await findBufferInstances(String(rec.factors.hook_text ?? ""));
      if (found.length === 0) {
        sendJson(res, {
          ok: false,
          error: "no Buffer post matching this hook — post it first, then link",
        });
        return true;
      }
      const updated = await mergePublishInstances(id, found);
      const channels = found.map((f) => f.channel);
      console.log(
        `[content] linked ${found.length} Buffer instance(s) to ${id}: ${channels.join(", ")}`,
      );
      sendJson(res, { ok: true, linked: channels, record: updated });
    } catch (e) {
      sendJson(res, { ok: false, error: (e as Error).message });
    }
    return true;
  }

  if (url.pathname === "/api/toggle" && post) {
    let on = false;
    try {
      on = Boolean((JSON.parse((await readBody(req)) || "{}") as { on?: unknown }).on);
    } catch {
      on = false;
    }
    setAutonomous(on);
    sendJson(res, await snapshot());
    return true;
  }

  return false;
}
