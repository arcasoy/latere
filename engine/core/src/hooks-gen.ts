import { loadHooks } from "./content";
import { guidanceBlock } from "./guidance";
import { newId } from "./ids";
import { readLedger } from "./io";
import { chat, parseJsonBlock } from "./llm";
import { writeRecord } from "./supabase";
import type { Hook } from "./types";

const SEED_HOOKS = 24;

async function hookTypePerformance(): Promise<string> {
  const agg = new Map<string, { sum: number; n: number }>();
  for (const r of await readLedger()) {
    const v = r.reward?.views;
    const t = r.factors.hook_type;
    if (typeof v === "number" && t) {
      const a = agg.get(t) ?? { sum: 0, n: 0 };
      a.sum += v;
      a.n += 1;
      agg.set(t, a);
    }
  }
  const rows = [...agg.entries()].map(
    ([t, a]) => `${t}: avg ${Math.round(a.sum / a.n)} views over ${a.n}`,
  );
  return rows.length ? rows.join("; ") : "no performance data yet (cold start — vary widely)";
}

const SYSTEM_BASE = `You write scroll-stopping short-form video hooks for nonyxa, an app for quitting nail biting and skin picking. It is a daily photo check-in: you photograph both hands, then swipe each of your ten fingertips clean or damaged, building a clean streak and a check-in streak. THE AUDIENCE IS NAIL BITERS AND SKIN PICKERS (a body-focused repetitive behavior, usually anxiety-linked) who are quietly embarrassed about it and have tried to quit before. It is NOT a nail-care, manicure, or beauty app, and a hook written for that audience is wrong. Brand voice: honest, warm, with teeth. NOT clinical, NOT corporate-SaaS, NOT casino-gamified, NOT childish. A hook is ONE punchy opening line that makes someone stop scrolling. Keep them tight and specific.`;

export async function generateHooks(n = 5, extraContext?: string): Promise<Hook[]> {
  const existing = await loadHooks();
  const recent = existing.slice(-SEED_HOOKS);
  const user =
    `Recent hooks (do NOT repeat or lightly rephrase these):\n${recent.map((h) => `- [${h.type}] ${h.text}`).join("\n")}\n\n` +
    `How hook TYPES have performed so far: ${await hookTypePerformance()}\n` +
    (extraContext ? `\nExtra context / direction: ${extraContext}\n` : "") +
    `\nGenerate ${n} NEW hooks, leaning into the higher-performing types when there's signal. ` +
    `Mix the types (pov, question, bold-claim, listicle). ` +
    `Return ONLY a JSON array, no prose: [{"type":"pov|question|bold-claim|listicle","text":"..."}]`;

  const out = await chat(SYSTEM_BASE + (await guidanceBlock()), user, {
    maxTokens: 80 * n + 100,
    label: "hooks",
  });
  const arr = parseJsonBlock<Array<{ type?: string; text?: string }>>(out, "array");
  const seen = new Set(existing.map((h) => h.text.toLowerCase().trim()));
  return arr
    .filter((x): x is { type?: string; text: string } =>
      Boolean(x && typeof x.text === "string" && x.text.trim()),
    )
    .filter((x) => !seen.has(x.text.toLowerCase().trim()))
    .map((x) => ({ id: newId("h"), type: String(x.type || "pov"), text: x.text.trim() }));
}

export async function saveHooks(hooks: readonly Hook[]): Promise<void> {
  for (const hook of hooks) await writeRecord("hooks", hook);
}

export async function replenishHooks(minUnused = 5, batch = 8): Promise<number> {
  const used = new Set((await readLedger()).map((r) => r.factors.hook_id).filter(Boolean));
  const unused = (await loadHooks()).filter((h) => !used.has(h.id));
  if (unused.length >= minUnused) return 0;
  const hooks = await generateHooks(batch);
  await saveHooks(hooks);
  console.log(`[hooks] pool low (${unused.length} unused) — generated ${hooks.length} new hooks`);
  return hooks.length;
}
