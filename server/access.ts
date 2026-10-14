import type { IncomingMessage } from "node:http";

const JWKS_TTL_MS = 60 * 60 * 1000;

interface Jwk {
  kid?: string;
  [claim: string]: unknown;
}

let jwksCache: { url: string | null; keys: Jwk[] | null; fetchedAt: number } = {
  url: null,
  keys: null,
  fetchedAt: 0,
};

export type Identity = { ok: true; email: string | null } | { ok: false; reason: string };

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function localPreview(request: IncomingMessage): boolean {
  if (process.env.GTM_DEV_BYPASS !== "1") return false;
  const host = (request.headers.host ?? "").replace(/:\d+$/, "");
  return LOOPBACK.has(host);
}

export async function authenticate(request: IncomingMessage): Promise<Identity> {
  if (localPreview(request)) {
    return { ok: true, email: null };
  }

  const team = process.env.ACCESS_TEAM_DOMAIN;
  const aud = process.env.ACCESS_AUD;
  if (!team || !aud) return { ok: false, reason: "Access is not configured" };

  const header = request.headers["cf-access-jwt-assertion"];
  const token =
    (Array.isArray(header) ? header[0] : header) ||
    readCookie(request.headers.cookie, "CF_Authorization");
  if (!token) return { ok: false, reason: "no Access assertion" };

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed assertion" };

  const head = decodeJson(parts[0] as string) as { kid?: string } | null;
  const claims = decodeJson(parts[1] as string) as {
    iss?: string;
    aud?: string | string[];
    exp?: number;
    email?: string;
  } | null;
  if (!head || !claims) return { ok: false, reason: "malformed assertion" };

  const issuer = `https://${team}.cloudflareaccess.com`;
  if (claims.iss !== issuer) return { ok: false, reason: "wrong issuer" };

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(aud)) return { ok: false, reason: "wrong audience" };

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= now) {
    return { ok: false, reason: "expired assertion" };
  }

  const key = await publicKey(issuer, head.kid);
  if (!key) return { ok: false, reason: "unknown signing key" };

  const verified = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    base64UrlToBytes(parts[2] as string),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!verified) return { ok: false, reason: "bad signature" };

  return { ok: true, email: claims.email ?? null };
}

async function publicKey(issuer: string, kid: string | undefined): Promise<CryptoKey | null> {
  if (!kid) return null;

  const url = `${issuer}/cdn-cgi/access/certs`;
  const stale = Date.now() - jwksCache.fetchedAt > JWKS_TTL_MS;
  let keys = jwksCache.url === url && !stale ? jwksCache.keys : null;
  if (!keys) {
    const response = await fetch(url);
    if (!response.ok) return null;
    const body = (await response.json()) as { keys?: Jwk[] };
    keys = body.keys ?? [];
    jwksCache = { url, keys, fetchedAt: Date.now() };
  }

  const jwk = keys.find((k) => k.kid === kid);
  if (!jwk) return null;

  return crypto.subtle.importKey(
    "jwk",
    { ...jwk, alg: "RS256" } as JsonWebKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const pair of header.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function decodeJson(segment: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
  } catch {
    return null;
  }
}
