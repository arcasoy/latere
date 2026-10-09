import { isPhotoBackground, matchShots } from "./catalog";
import { DEFAULT_POLICY, type PolicyOpts } from "./constants";
import { loadFormats, loadHooks } from "./content";
import { newId, nowIso } from "./ids";
import type {
  CaptureRequest,
  Composition,
  Factors,
  Format,
  Hook,
  LedgerRecord,
  Reward,
  RoleSlot,
  Shot,
  Slide,
} from "./types";

export type CandidateMode = "exploit" | "explore" | "deviate";

export interface Candidate {
  factors: Factors;
  mode: CandidateMode;
  reason: string;
}

export interface Batch {
  renders: Candidate[];
  requests: CaptureRequest[];
}

interface Agg {
  sum: number;
  n: number;
}

function add(m: Map<string, Agg>, key: string | undefined, v: number): void {
  if (!key) return;
  const a = m.get(key) ?? { sum: 0, n: 0 };
  a.sum += v;
  a.n += 1;
  m.set(key, a);
}

function avg(a: Agg | undefined): number {
  return a && a.n > 0 ? a.sum / a.n : 0;
}

interface DimAggs {
  format: Map<string, Agg>;
  tag: Map<string, Agg>;
  hookType: Map<string, Agg>;
  copyStyle: Map<string, Agg>;
}

function aggregate(history: readonly LedgerRecord[], rewardKey: keyof Reward): DimAggs {
  const d: DimAggs = {
    format: new Map(),
    tag: new Map(),
    hookType: new Map(),
    copyStyle: new Map(),
  };
  for (const r of history) {
    const reward = r.reward?.[rewardKey];
    if (typeof reward !== "number") continue;
    const f = r.factors;
    add(d.format, f.composition?.format ?? f.format, reward);
    add(d.hookType, f.hook_type, reward);
    add(d.copyStyle, f.copy_style, reward);
    for (const t of f.used_tags ?? []) add(d.tag, t, reward);
  }
  return d;
}

function weightedPick<T>(items: readonly T[], weight: (t: T) => number): T {
  const ws = items.map((i) => Math.max(0.001, weight(i)));
  const total = ws.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function sample<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function bestOf(opts: readonly string[], m: Map<string, Agg>): string {
  let best = opts[0]!;
  let bv = -1;
  for (const o of opts) {
    const v = avg(m.get(o));
    if (v > bv) {
      bv = v;
      best = o;
    }
  }
  return best;
}

function randRange(range: readonly [number, number]): number {
  const [lo, hi] = range;
  return Math.round(lo + Math.random() * (hi - lo));
}

function prio(mode: CandidateMode): number {
  return mode === "exploit" ? 3 : mode === "explore" ? 2 : 1;
}

function pickMode(i: number, cfg: PolicyOpts): CandidateMode {
  const frac = i / Math.max(1, cfg.batchSize);
  if (frac < cfg.exploit) return "exploit";
  if (frac < cfg.exploit + cfg.explore) return "explore";
  return "deviate";
}

function pickFormat(formats: readonly Format[], d: DimAggs, mode: CandidateMode): Format {
  if (mode === "exploit") return weightedPick(formats, (fm) => 1 + avg(d.format.get(fm.id)));
  return sample(formats);
}

function pickHook(
  hooks: readonly Hook[],
  d: DimAggs,
  mode: CandidateMode,
  usedHookIds: ReadonlySet<string>,
): Hook | undefined {
  if (hooks.length === 0) return undefined;
  const unused = hooks.filter((h) => !usedHookIds.has(h.id));
  const pool = unused.length > 0 ? unused : hooks;
  if (mode === "exploit") return weightedPick(pool, (h) => 1 + avg(d.hookType.get(h.type)));
  return sample(pool);
}

function compatibleHooks(
  hooks: readonly Hook[],
  fmt: Format,
  rejectedPairs: ReadonlyMap<string, number>,
): Hook[] {
  return hooks.filter((h) => {
    if (fmt.hook_types && !fmt.hook_types.includes(h.type)) return false;
    return (rejectedPairs.get(`${h.type}|${fmt.id}`) ?? 0) < 2;
  });
}

function countRejectedPairs(history: readonly LedgerRecord[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of history) {
    if (r.status !== "rejected") continue;
    const t = r.factors.hook_type;
    const f = r.factors.composition?.format ?? r.factors.format;
    if (!t || !f) continue;
    const key = `${t}|${f}`;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}

function pickShot(cands: readonly Shot[], d: DimAggs, mode: CandidateMode): Shot {
  if (mode === "exploit") {
    return weightedPick(cands, (s) => 1 + s.tags.reduce((acc, t) => acc + avg(d.tag.get(t)), 0));
  }
  return sample(cands);
}

function candidateReason(fmt: Format, opener: string, mode: CandidateMode, d: DimAggs): string {
  const fa = d.format.get(fmt.id);
  const open = fmt.permute?.order ? `, opening on ${opener}` : "";
  if (mode === "exploit" && fa && fa.n > 0) {
    return `${fmt.label}${open} — exploiting (avg ${Math.round(avg(fa))} views over ${fa.n}).`;
  }
  return `${fmt.label}${open} — ${mode}.`;
}

const SLIDE_ASPECTS: ReadonlyArray<"9:16" | "4:5"> = ["9:16", "4:5"];
const COPY_STYLES: readonly string[] = ["numbered", "plain"];

function imageOpener(shot: Shot): string {
  const t = shot.tags.find((x) => x !== "ai-gen" && x !== "background") ?? "image";
  return `img:${t}`;
}

function promisedCount(hookText: string): number | null {
  const m = hookText.match(
    /^(\d{1,2})\s+(?:things|ways|tips|habits|mistakes|steps|signs|reasons)\b/i,
  );
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 20 ? n : null;
}

function buildSlideshowCandidate(
  fmt: Format,
  pool: readonly Shot[],
  hook: Hook,
  d: DimAggs,
  mode: CandidateMode,
): Candidate {
  const promised = promisedCount(hook.text);
  const slideCount = promised
    ? promised + 1
    : Math.max(3, Math.min(randRange(fmt.slides ?? [5, 7]), 10));
  const backgrounds: Shot[] = [];
  const remaining = [...pool];
  for (let i = 0; i < slideCount; i++) {
    const from = remaining.length > 0 ? remaining : pool;
    const shot = pickShot(from, d, mode);
    backgrounds.push(shot);
    const ix = remaining.indexOf(shot);
    if (ix >= 0) remaining.splice(ix, 1);
  }

  const slides: Slide[] = backgrounds.map((shot, i) => ({
    background: { shot_id: shot.id },
    text:
      i === 0
        ? { body: hook.text, role: "hook" }
        : !promised && i === backgrounds.length - 1
          ? { body: "", role: "cta" }
          : { body: "", role: "beat" },
  }));

  const usedTags = [...new Set(backgrounds.flatMap((s) => s.tags))];
  const opener = imageOpener(backgrounds[0]!);
  const aspect = sample(SLIDE_ASPECTS);
  const copyStyle = (
    promised
      ? "numbered"
      : mode === "exploit"
        ? bestOf(COPY_STYLES, d.copyStyle)
        : sample(COPY_STYLES)
  ) as "numbered" | "plain";
  const composition: Composition = {
    format: fmt.id,
    segments: [],
    slides,
  };

  const factors: Factors = {
    hook_id: hook.id,
    hook_text: hook.text,
    hook_type: hook.type,
    format: fmt.id,
    composition,
    opener,
    aspect,
    slide_count: slideCount,
    copy_style: copyStyle,
    used_tags: usedTags,
  };
  return {
    factors,
    mode,
    reason: `${candidateReason(fmt, opener, mode, d)} ${slideCount} slides, ${aspect}.`,
  };
}

function comboKey(f: Factors): string {
  const media = f.composition?.slides?.length
    ? f.composition.slides.map((s) => s.background.shot_id ?? s.background.url ?? "")
    : (f.composition?.segments ?? []).map((s) => s.shot_id ?? "");
  return `${f.hook_id ?? ""}|${f.composition?.format ?? f.format ?? ""}|${[...media].sort().join(",")}`;
}

export async function decideBatch(
  history: readonly LedgerRecord[],
  shots: readonly Shot[],
  opts: Partial<PolicyOpts> = {},
): Promise<Batch> {
  const cfg: PolicyOpts = { ...DEFAULT_POLICY, ...opts };
  const formats = loadFormats().filter((fm) => !fm.deferred && fm.kind === "slideshow");
  const hooks = await loadHooks();
  const d = aggregate(history, cfg.rewardKey);
  const usedHookIds = new Set(
    history.map((r) => r.factors.hook_id).filter((x): x is string => Boolean(x)),
  );
  const seenCombos = new Set(history.map((r) => comboKey(r.factors)));
  const rejectedPairs = countRejectedPairs(history);

  const renders: Candidate[] = [];
  const requests: CaptureRequest[] = [];
  const reqSeen = new Map<string, CaptureRequest>();
  if (formats.length === 0) return { renders, requests };

  const fileRequest = (slot: RoleSlot, fmt: Format, mode: CandidateMode): void => {
    const tags = slot.match_tags_any ?? [];
    const key = `${slot.role}::${tags.join(",")}`;
    const ex = reqSeen.get(key);
    if (ex) {
      ex.quantity += 1;
      ex.priority = Math.max(ex.priority, prio(mode));
      return;
    }
    const req: CaptureRequest = {
      id: newId("req"),
      created_at: nowIso(),
      role: slot.role,
      want_tags: tags,
      quantity: 1,
      priority: prio(mode),
      format_context: fmt.id,
      rationale: `Want ${slot.role} footage (${tags.join(" / ") || "any"}) to unlock ${fmt.label}.`,
      status: "open",
      fulfilled_by: [],
    };
    reqSeen.set(key, req);
    requests.push(req);
  };

  const pushUnique = (c: Candidate): void => {
    const key = comboKey(c.factors);
    if (seenCombos.has(key)) return;
    seenCombos.add(key);
    renders.push(c);
  };

  for (let i = 0; i < cfg.batchSize; i++) {
    const mode = pickMode(i, cfg);
    const fmt = pickFormat(formats, d, mode);
    const hook = pickHook(compatibleHooks(hooks, fmt, rejectedPairs), d, mode, usedHookIds);

    if (!hook) continue;
    const slot = fmt.segments[0];
    const pool = matchShots(
      shots.filter(isPhotoBackground),
      slot?.match_tags_any ?? [],
      undefined,
      "image",
    );
    if (pool.length === 0) {
      if (slot && slot.required !== false) fileRequest(slot, fmt, mode);
      continue;
    }
    pushUnique(buildSlideshowCandidate(fmt, pool, hook, d, mode));
  }
  return { renders, requests };
}
