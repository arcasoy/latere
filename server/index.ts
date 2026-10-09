import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { authenticate } from "./access";
import { acquisition } from "./acquisition";
import { connectors } from "./connectors";
import { captureConsole, contentRoute } from "./content";
import { payback } from "./payback";
import { revenue } from "./revenuecat";

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, "..", "dist");

const PORT = Number(process.env.GTM_PORT ?? "5173");
const HOST = process.env.GTM_HOST ?? "127.0.0.1";

const ACQUISITION_TTL_MS = 6 * 60 * 60 * 1000;
const REVENUE_TTL_MS = 10 * 60 * 1000;

type Panel = { configured: boolean; errors?: string[] };

const panelCache = new Map<string, { at: number; body: string }>();

async function cachedPanel(
  key: string,
  ttlMs: number,
  bypass: boolean,
  build: () => Promise<Panel>,
): Promise<{ status: number; body: string }> {
  if (!bypass) {
    const hit = panelCache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return { status: 200, body: hit.body };
  }

  let panel: Panel;
  try {
    panel = await build();
  } catch (error) {
    panelCache.delete(key);
    return {
      status: 502,
      body: JSON.stringify({ configured: true, errors: [(error as Error).message] }),
    };
  }

  const body = JSON.stringify(panel);
  const clean = panel.configured && !panel.errors?.length;
  if (clean) panelCache.set(key, { at: Date.now(), body });
  else panelCache.delete(key);
  return { status: 200, body };
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".mp4": "video/mp4",
};

async function serveStatic(res: ServerResponse, urlPath: string): Promise<void> {
  const requested = resolve(join(DIST, urlPath === "/" ? "index.html" : urlPath));
  const inside = !relative(DIST, requested).startsWith("..");

  let file = inside ? requested : join(DIST, "index.html");
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(DIST, "index.html");
  }

  try {
    const buf = await readFile(file);
    const immutable = urlPath.startsWith("/assets/");
    res.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const identity = await authenticate(req);
  if (!identity.ok) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Forbidden — ${identity.reason}\n`);
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/api/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, email: identity.email }));
    return;
  }

  if (url.pathname === "/api/connectors") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(connectors()));
    return;
  }

  if (url.pathname === "/api/acquisition") {
    const { status, body } = await cachedPanel(
      "acquisition",
      ACQUISITION_TTL_MS,
      url.searchParams.has("refresh"),
      () => acquisition(process.env),
    );
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body);
    return;
  }

  if (url.pathname === "/api/payback") {
    const panel = await payback(process.env, url.searchParams);
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(panel));
    return;
  }

  if (url.pathname === "/api/revenue") {
    const { status, body } = await cachedPanel(
      "revenue",
      REVENUE_TTL_MS,
      url.searchParams.has("refresh"),
      () => revenue(process.env),
    );
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body);
    return;
  }

  if (await contentRoute(req, res, url)) return;

  await serveStatic(res, url.pathname);
}

captureConsole();

createServer((req, res) => {
  handle(req, res).catch((error: Error) => {
    console.warn(`[gtm] ${req.method} ${req.url} failed: ${error.message}`);
    if (res.headersSent) return res.end();
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("internal error\n");
  });
}).listen(PORT, HOST, () => {
  console.log(`[gtm] console on http://${HOST}:${PORT}`);
});
