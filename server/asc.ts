const API = "https://api.appstoreconnect.apple.com/v1";
const TOKEN_TTL_S = 1200;

export interface AscConfig {
  keyId: string;
  issuerId: string;
  privateKey: string;
  vendorNumber: string;
  appId: string;
}

async function signingKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
}

const b64url = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlJson = (o: unknown): string => b64url(new TextEncoder().encode(JSON.stringify(o)));

async function token(config: AscConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64urlJson({ alg: "ES256", kid: config.keyId, typ: "JWT" });
  const body = b64urlJson({
    iss: config.issuerId,
    iat: now,
    exp: now + TOKEN_TTL_S,
    aud: "appstoreconnect-v1",
  });
  const key = await signingKey(config.privateKey);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

async function body(response: Response): Promise<{ status: number; text: string }> {
  const buffer = new Uint8Array(await response.arrayBuffer());
  const gzipped = buffer[0] === 0x1f && buffer[1] === 0x8b;
  const text = gzipped
    ? await new Response(
        new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip")),
      ).text()
    : new TextDecoder().decode(buffer);

  return { status: response.status, text };
}

async function call(
  url: string,
  config: AscConfig,
  { accept = "application/json" }: { accept?: string } = {},
): Promise<{ status: number; text: string }> {
  return body(
    await fetch(url, {
      headers: { Authorization: `Bearer ${await token(config)}`, Accept: accept },
    }),
  );
}

async function segmentBody(url: string): Promise<{ status: number; text: string }> {
  return body(await fetch(url));
}

async function json<T>(url: string, config: AscConfig): Promise<T> {
  const r = await call(url, config);
  if (r.status >= 400) throw new Error(`App Store Connect ${r.status}: ${r.text.slice(0, 200)}`);
  return JSON.parse(r.text) as T;
}

type Row = Record<string, string | undefined>;

function rows(tsv: string): Row[] {
  const lines = tsv.trim().split("\n");
  if (lines.length < 2) return [];
  const cols = (lines[0] as string).split("\t").map((c) => c.trim());
  return lines
    .slice(1)
    .map((line) => Object.fromEntries(line.split("\t").map((v, i) => [cols[i], v?.trim()])) as Row);
}

function column(row: Row, candidates: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const hit = keys.find((k) => k.toLowerCase() === candidate.toLowerCase());
    if (hit) return hit;
  }
  return undefined;
}

const dayStrings = (days: number, endingDaysAgo = 1): string[] => {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (i + endingDaysAgo) * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out.reverse();
};

async function pooled<T>(thunks: (() => Promise<T>)[], limit = 6): Promise<T[]> {
  const results = new Array<T>(thunks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, thunks.length) }, async () => {
    while (cursor < thunks.length) {
      const i = cursor++;
      results[i] = await (thunks[i] as () => Promise<T>)();
    }
  });
  await Promise.all(workers);
  return results;
}

export interface DailyDownload {
  date: string;
  firstTime?: number;
  updates?: number;
  pending?: boolean;
  error?: string;
}

export async function dailyDownloads(config: AscConfig, days = 30): Promise<DailyDownload[]> {
  const dates = dayStrings(days);
  return pooled(
    dates.map((date) => async (): Promise<DailyDownload> => {
      const q = new URLSearchParams({
        "filter[frequency]": "DAILY",
        "filter[reportType]": "SALES",
        "filter[reportSubType]": "SUMMARY",
        "filter[vendorNumber]": config.vendorNumber,
        "filter[reportDate]": date,
      });
      const r = await call(`${API}/salesReports?${q}`, config, { accept: "application/a-gzip" });
      if (r.status === 404) return { date, pending: true };
      if (r.status >= 400) return { date, error: `HTTP ${r.status}` };

      const mine = rows(r.text).filter(
        (x) => !config.appId || x["Apple Identifier"] === config.appId,
      );
      let firstTime = 0;
      let updates = 0;
      for (const row of mine) {
        const units = Number(row.Units || 0);
        const type = String(row["Product Type Identifier"] || "");
        if (type.startsWith("1")) firstTime += units;
        else if (type.startsWith("7")) updates += units;
      }
      return { date, firstTime, updates };
    }),
  );
}

export type AttributionState =
  | "ready"
  | "uncampaigned"
  | "pending"
  | "unrequested"
  | "unreadable"
  | "error";

export interface Referrer {
  type: string;
  info: string | null;
  downloads: number;
}

export interface DownloadSources {
  state: Exclude<AttributionState, "error">;
  campaigns: { campaign: string; downloads: number }[];
  referrers: Referrer[];
  attributedFirstTime: number;
  note?: string;
  stopped?: boolean;
}

interface AscList<T> {
  data?: T[];
}

export async function downloadSources(config: AscConfig): Promise<DownloadSources> {
  const requests = await json<
    AscList<{
      id: string;
      attributes?: { accessType?: string; stoppedDueToInactivity?: boolean };
    }>
  >(`${API}/apps/${config.appId}/analyticsReportRequests`, config);
  if (!requests.data?.length) {
    return {
      state: "unrequested",
      campaigns: [],
      referrers: [],
      attributedFirstTime: 0,
      note: "no analytics report request exists",
    };
  }

  const stopped = requests.data.some((r) => r.attributes?.stoppedDueToInactivity);

  const ordered = [...requests.data].sort(
    (a, b) =>
      Number(b.attributes?.accessType === "ONGOING") -
      Number(a.attributes?.accessType === "ONGOING"),
  );

  for (const request of ordered) {
    const reports = await json<AscList<{ id: string; attributes?: { name?: string } }>>(
      `${API}/analyticsReportRequests/${request.id}/reports?limit=200`,
      config,
    );
    const report = reports.data?.find((r) => r.attributes?.name === "App Downloads Detailed");
    if (!report) continue;

    const instances = await json<AscList<{ id: string }>>(
      `${API}/analyticsReports/${report.id}/instances?filter[granularity]=DAILY&limit=200`,
      config,
    );
    if (!instances.data?.length) continue;

    const totals = new Map<string, number>();
    const referrers = new Map<string, Referrer>();
    let campaignColumn: string | undefined;
    let countColumn: string | undefined;
    let kindColumn: string | undefined;
    let sourceTypeColumn: string | undefined;
    let sourceInfoColumn: string | undefined;

    for (const instance of instances.data.slice(-30)) {
      const segments = await json<AscList<{ attributes: { url: string } }>>(
        `${API}/analyticsReportInstances/${instance.id}/segments`,
        config,
      );
      for (const segment of segments.data ?? []) {
        const download = await segmentBody(segment.attributes.url);
        const parsed = rows(download.text);
        const first = parsed[0];
        if (!first) continue;

        campaignColumn ??= column(first, ["Campaign", "Campaign Name"]);
        countColumn ??= column(first, ["Counts", "Count", "Units", "Downloads"]);
        kindColumn ??= column(first, ["Download Type"]);
        sourceTypeColumn ??= column(first, ["Source Type"]);
        sourceInfoColumn ??= column(first, ["Source Info"]);

        if (!countColumn) {
          return {
            state: "unreadable",
            campaigns: [],
            referrers: [],
            attributedFirstTime: 0,
            note: `report is missing its count column; saw: ${Object.keys(first).join(", ")}`,
          };
        }

        for (const row of parsed) {
          const count = Number(row[countColumn] || 0);

          const campaign = campaignColumn ? row[campaignColumn] : undefined;
          if (campaign && campaign !== "No Campaign") {
            totals.set(campaign, (totals.get(campaign) ?? 0) + count);
          }

          const kind = kindColumn ? row[kindColumn] : undefined;
          if (!sourceTypeColumn || !/first[- ]time/i.test(kind ?? "")) continue;

          const type = row[sourceTypeColumn] || "Unavailable";
          const info = (sourceInfoColumn ? row[sourceInfoColumn] : "") || null;
          const key = `${type}\u0000${info ?? ""}`;
          const seen = referrers.get(key);
          if (seen) seen.downloads += count;
          else referrers.set(key, { type, info, downloads: count });
        }
      }
    }

    const byReferrer = [...referrers.values()].sort((a, b) => b.downloads - a.downloads);
    return {
      state: totals.size ? "ready" : "uncampaigned",
      stopped,
      campaigns: [...totals].map(([campaign, downloads]) => ({ campaign, downloads })),
      referrers: byReferrer,
      attributedFirstTime: byReferrer.reduce((sum, r) => sum + r.downloads, 0),
    };
  }

  return {
    state: "pending",
    stopped,
    campaigns: [],
    referrers: [],
    attributedFirstTime: 0,
    note: "Apple has accepted the request but has not generated the report yet (24-48h)",
  };
}
