import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { paths } from "./paths";
import { readRecords, writeRecord } from "./supabase";

export interface Guidance {
  facts: string[];
  learned: string[];
}

const MAX_LEARNED_IN_PROMPT = 10;

const factsFile = (): string => join(paths().content, "guidance.yaml");

function loadList(file: string, key: string): string[] {
  if (!existsSync(file)) return [];
  const doc = (parse(readFileSync(file, "utf8")) ?? {}) as Record<string, unknown>;
  const v = doc[key];
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
}

export async function loadGuidance(): Promise<Guidance> {
  const lessons = await readRecords<{ id: string; reason: string; created_at: string }>("lessons");
  lessons.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { facts: loadList(factsFile(), "facts"), learned: lessons.map((l) => l.reason) };
}

export async function guidanceBlock(): Promise<string> {
  const g = await loadGuidance();
  const lines: string[] = [];
  if (g.facts.length) {
    lines.push("PRODUCT FACTS (never violate):", ...g.facts.map((f) => `- ${f}`));
  }
  const learned = g.learned.slice(-MAX_LEARNED_IN_PROMPT);
  if (learned.length) {
    lines.push(
      "LESSONS from rejected posts (do not repeat these mistakes):",
      ...learned.map((l) => `- ${l}`),
    );
  }
  return lines.length ? `\n\n${lines.join("\n")}` : "";
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

export async function appendLearned(reason: string): Promise<boolean> {
  const r = reason.trim();
  if (r.length < 4) return false;
  const g = await loadGuidance();
  const known = new Set([...g.facts, ...g.learned].map(norm));
  if (known.has(norm(r))) return false;
  await writeRecord("lessons", {
    id: createHash("sha256").update(norm(r)).digest("hex"),
    reason: r,
    created_at: new Date().toISOString(),
  });
  return true;
}
