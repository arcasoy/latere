import { collect } from "@latere/collect";
import {
  generateBackgrounds,
  generateHooks,
  hasImageGen,
  hasLLM,
  ingestShot,
  isPhotoBackground,
  loadShots,
  readLedger,
  saveHooks,
  upsertLedger,
} from "@latere/core";
import { uploadSlide } from "@latere/publish";
import { removeSupersededRender, renderSlideshow } from "@latere/render";
import { runIteration } from "./loop";
import { checkStorage } from "./storage-check";

function getFlag(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = process.argv.indexOf(name);
  const next = process.argv[i + 1];
  if (i >= 0 && next && !next.startsWith("--")) return next;
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function positionals(): string[] {
  const out: string[] = [];
  const args = process.argv.slice(3);
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      if (!a.includes("=")) i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

async function genHooks(): Promise<void> {
  if (!hasLLM()) {
    console.error("set OPENROUTER_API_KEY in .env (get one at openrouter.ai/keys)");
    process.exit(1);
  }
  const n = Number(getFlag("--n") ?? "5");
  const ctx = getFlag("--context");
  const hooks = await generateHooks(n, ctx);
  await saveHooks(hooks);
  console.log(`[gen-hooks] added ${hooks.length} hook(s) to Supabase:`);
  for (const h of hooks) console.log(`  - [${h.type}] ${h.text}`);
}

async function ingest(): Promise<void> {
  const files = positionals();
  const tags = (getFlag("--tags") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const appScreen = getFlag("--app-screen");
  if (files.length === 0 || tags.length === 0) {
    console.error(
      "usage: latere ingest <files…> --tags hands,nails,loopable [--app-screen result]",
    );
    process.exit(1);
  }
  for (const f of files) {
    const shot = await ingestShot(f, { tags, ...(appScreen ? { appScreen } : {}) });
    console.log(
      `[ingest] ${shot.id} -> ${shot.key}  tags=[${shot.tags.join(",")}]  ${shot.duration_s ?? "?"}s ${shot.orientation ?? ""}`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function loop(render: boolean): Promise<void> {
  const res = await runIteration({ render });
  console.log(`[loop] ${res.summary}`);
}

async function runAuto(intervalSec: number, iterations: number | undefined): Promise<void> {
  console.log(`[run] interval ${intervalSec}s; generated posts require review`);
  let i = 0;
  for (;;) {
    i++;
    console.log(`\n=== iteration ${i}${iterations ? `/${iterations}` : ""} ===`);
    const res = await runIteration({ render: true });
    console.log(`[run] ${res.summary}`);
    await collect();
    if (iterations && i >= iterations) break;
    await sleep(intervalSec * 1000);
  }
}

async function renderOne(id: string | undefined): Promise<void> {
  const ledger = await readLedger();
  const rec = id
    ? ledger.find((r) => r.id === id)
    : [...ledger].reverse().find((r) => r.status === "drafted");
  if (!rec) {
    console.error(id ? `no record ${id}` : "no drafted record to render");
    process.exit(1);
  }
  if (rec.factors.composition?.slides?.length) {
    const r = await renderSlideshow(rec.id, rec.factors);
    const render: { path?: string; urls?: string[]; render_spec: Record<string, unknown> } = {
      ...(r.paths[0] ? { path: r.paths[0].replace(/\/[^/]+$/, "") } : {}),
      render_spec: r.render_spec,
    };
    const urls: string[] = [];
    for (const p of r.paths) {
      const url = await uploadSlide(p, rec.id, p.split("/").pop()!);
      if (!url) throw new Error("Slide upload requires Latere Supabase");
      urls.push(url);
    }
    render.urls = urls;
    await upsertLedger({ ...rec, status: "review", render });
    await removeSupersededRender(rec.id, rec.render?.path, render.path);
    console.log(`[render] ${rec.id} -> ${r.paths.length} slides${render.urls ? " (hosted)" : ""}`);
    return;
  }
  throw new Error("Video rendering was removed; create a photo post instead");
}

async function genImages(): Promise<void> {
  if (!hasImageGen()) {
    console.error("set OPENROUTER_API_KEY in .env — image gen runs through OpenRouter");
    process.exit(1);
  }
  const n = Number(getFlag("--n") ?? "4");
  const images = (await loadShots()).filter(isPhotoBackground);
  const made = await generateBackgrounds(n, images.length);
  console.log(
    `[gen-images] generated + ingested ${made}/${n} backgrounds (pool now ${images.length + made})`,
  );
}

function usage(): void {
  console.log(
    'usage: cli <loop|run|collect|render|ingest|gen-hooks|gen-images|storage-check> [--tags a,b] [--app-screen X] [--n N] [--context "..."] [--interval S] [--iterations N] [--no-render]',
  );
}

async function main(): Promise<void> {
  switch (process.argv[2]) {
    case "storage-check":
      await checkStorage();
      break;
    case "loop":
      await loop(!hasFlag("--no-render"));
      break;
    case "run":
      await runAuto(
        Number(getFlag("--interval") ?? "21600"),
        getFlag("--iterations") ? Number(getFlag("--iterations")) : undefined,
      );
      break;
    case "collect": {
      const r = await collect();
      console.log(`[collect] checked ${r.checked}, updated ${r.updated}, skipped ${r.skipped}`);
      break;
    }
    case "render":
      await renderOne(process.argv[3]);
      break;
    case "ingest":
      await ingest();
      break;
    case "gen-hooks":
      await genHooks();
      break;
    case "gen-images":
      await genImages();
      break;
    default:
      usage();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
