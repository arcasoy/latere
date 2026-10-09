import { basename, dirname } from "node:path";
import type { Candidate } from "@latere/core";
import {
  type CaptureRequest,
  decideBatch,
  ensureBackgroundPool,
  generateSlideCopy,
  hasLLM,
  type LedgerRecord,
  loadShots,
  newId,
  nowIso,
  type PolicyOpts,
  readLedger,
  readRequests,
  replenishHooks,
  upsertLedger,
  upsertRequest,
} from "@latere/core";
import { uploadSlide } from "@latere/publish";
import { renderSlideshow } from "@latere/render";

export interface IterationOpts {
  render: boolean;
  batchSize?: number;
  maxRenders?: number;
}

export interface IterationResult {
  made: number;
  filed: number;
  summary: string;
}

function envNum(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function reqKey(r: CaptureRequest): string {
  return `${r.role ?? r.shot_type ?? ""}::${(r.want_tags ?? []).join(",")}::${r.app_screen ?? ""}`;
}

function createdToday(history: readonly LedgerRecord[]): number {
  const today = new Date().toISOString().slice(0, 10);
  return history.filter((r) => r.created_at.slice(0, 10) === today && r.status !== "rejected")
    .length;
}

async function fillSlideCopy(c: Candidate): Promise<boolean> {
  const slides = c.factors.composition?.slides ?? [];
  const nBeats = slides.filter((s) => s.text?.role === "beat").length;
  if (nBeats === 0) return true;
  if (!hasLLM()) {
    console.warn("[loop] slideshow candidate skipped — OPENROUTER_API_KEY not set (copy gen)");
    return false;
  }
  try {
    const copy = await generateSlideCopy(
      String(c.factors.hook_text ?? ""),
      nBeats,
      c.factors.copy_style ?? "plain",
    );
    let b = 0;
    for (const s of slides) {
      if (s.text?.role === "beat") s.text.body = copy.beats[b++] ?? "";
      else if (s.text?.role === "cta") s.text.body = copy.cta;
    }
    return true;
  } catch (e) {
    console.warn(`[loop] slide copy failed: ${(e as Error).message}`);
    return false;
  }
}

async function makeSlideshow(id: string, record: LedgerRecord): Promise<void> {
  const r = await renderSlideshow(id, record.factors);
  record.status = "rendered";
  record.render = {
    ...(r.paths[0] ? { path: dirname(r.paths[0]) } : {}),
    render_spec: r.render_spec,
  };
  const urls: string[] = [];
  for (const p of r.paths) {
    const url = await uploadSlide(p, id, basename(p));
    if (!url) throw new Error("Slide upload requires Latere Supabase");
    urls.push(url);
  }
  record.render.urls = urls;
}

export async function runIteration(opts: IterationOpts): Promise<IterationResult> {
  if (hasLLM()) {
    try {
      await replenishHooks();
    } catch (e) {
      console.warn(`[loop] hook replenish failed: ${(e as Error).message}`);
    }
  }
  try {
    const pool = await ensureBackgroundPool();
    if (pool.generated > 0)
      console.log(`[loop] image pool topped up: +${pool.generated} (now ${pool.poolSize})`);
    else if (pool.skipped) console.log(`[loop] image pool at ${pool.poolSize} — ${pool.skipped}`);
  } catch (e) {
    console.warn(`[loop] image pool top-up failed: ${(e as Error).message}`);
  }

  const history = await readLedger();
  const shots = await loadShots();
  const policyOpts: Partial<PolicyOpts> = {};
  if (opts.batchSize != null) policyOpts.batchSize = opts.batchSize;

  const { renders, requests } = await decideBatch(history, shots, policyOpts);

  const dailyCap = envNum("LATERE_DAILY_POST_CAP", 6);
  const perTick = opts.maxRenders ?? envNum("LATERE_RENDERS_PER_TICK", 1);
  const capLeft = Math.max(0, dailyCap - createdToday(history));
  const take = renders.slice(0, Math.min(perTick, capLeft));
  if (renders.length > take.length) {
    const why = capLeft === 0 ? `daily cap (${dailyCap}) reached` : `per-tick cap (${perTick})`;
    console.log(`[loop] ${renders.length} candidates, taking ${take.length} — ${why}`);
  }

  let made = 0;
  for (const c of take) {
    if (!(await fillSlideCopy(c))) continue;

    const id = newId("v");
    const record: LedgerRecord = {
      id,
      created_at: nowIso(),
      status: "drafted",
      factors: c.factors,
      embedding: null,
    };
    if (opts.render) {
      try {
        await makeSlideshow(id, record);
      } catch (e) {
        console.warn(`[loop] render failed for ${id}: ${(e as Error).message}`);
        record.status = "drafted";
        await upsertLedger(record);
        continue;
      }
    }
    if (opts.render) record.status = "review";
    await upsertLedger(record);
    console.log(`[loop] ${id}: ${record.status}`);
    made++;
  }

  const open = (await readRequests()).filter((r) => r.status === "open");
  let filed = 0;
  for (const req of requests) {
    const dup = open.find((r) => reqKey(r) === reqKey(req));
    if (dup) {
      dup.quantity += req.quantity;
      dup.priority = Math.max(dup.priority, req.priority);
      await upsertRequest(dup);
    } else {
      await upsertRequest(req);
      open.push(req);
      filed++;
    }
  }

  return {
    made,
    filed,
    summary: `${made} variant${made === 1 ? "" : "s"} made · ${filed} new shot request${filed === 1 ? "" : "s"}`,
  };
}
