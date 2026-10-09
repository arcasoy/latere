import { guidanceBlock } from "./guidance";
import { chat, parseJsonBlock } from "./llm";

const SYSTEM_BASE =
  `You write slide copy for nonyxa carousels (TikTok photo mode / IG). nonyxa is an app for ` +
  `quitting nail biting and skin picking: a daily photo check-in where you photograph both hands, ` +
  `then swipe each of your ten fingertips clean or damaged, building a clean streak and a check-in ` +
  `streak. THE AUDIENCE IS NAIL BITERS AND SKIN PICKERS (a body-focused repetitive behavior, ` +
  `usually anxiety-linked) who are quietly embarrassed about it and have tried to quit before. It ` +
  `is NOT a nail-care, manicure, or beauty app, and copy written for that audience is wrong. ` +
  `Voice: honest, warm, with teeth. NOT clinical, NOT corporate, NOT casino-gamified, NOT ` +
  `childish. Each beat is ONE short punchy line (max ~12 words) that advances the argument the ` +
  `hook opened. The CTA is a short nudge to try the app (max ~6 words), never salesy.`;

export interface SlideCopy {
  beats: string[];
  cta: string;
}

export type CopyStyle = "numbered" | "plain";

export async function generateSlideCopy(
  hookText: string,
  nBeats: number,
  style: CopyStyle = "plain",
): Promise<SlideCopy> {
  const styleLine =
    style === "numbered"
      ? `Number each beat ("1. …", "2. …").`
      : `No numbering — each beat is a standalone line.`;
  const user =
    `Slide 1 (the hook, already set): "${hookText}"\n\n` +
    `Write the ${nBeats} middle slides + the final CTA slide. ${styleLine} ` +
    `Return ONLY JSON, no prose: {"beats":["...", ...],"cta":"..."}`;
  const out = await chat(SYSTEM_BASE + (await guidanceBlock()), user, {
    temperature: 0.85,
    maxTokens: 90 * nBeats + 120,
    label: "slides",
  });
  const parsed = parseJsonBlock<{ beats?: unknown; cta?: unknown }>(out, "object");
  const beats = (Array.isArray(parsed.beats) ? parsed.beats : [])
    .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
    .map((b) => b.trim());
  const cta =
    typeof parsed.cta === "string" && parsed.cta.trim() ? parsed.cta.trim() : "Start your streak";
  if (beats.length !== nBeats)
    throw new Error(`slide copy: expected ${nBeats} beats, received ${beats.length}`);
  return { beats, cta };
}
