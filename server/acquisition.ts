import {
  type AttributionState,
  type DailyDownload,
  dailyDownloads,
  downloadSources,
  type Referrer,
} from "./asc";
import { hogql } from "./posthog";

export type { AttributionState, Referrer };

const WINDOW_DAYS = 30;

const CLICKS_BY_CAMPAIGN = `
  SELECT
    properties.ct AS ct,
    properties.src AS src,
    properties.post AS post,
    countIf(properties.$os = 'iOS') AS clicks,
    count() AS clicks_all,
    uniqIf(person_id, properties.$os = 'iOS') AS people
  FROM events
  WHERE event = 'app_store_click'
    AND timestamp > now() - INTERVAL ${WINDOW_DAYS} DAY
    AND properties.ct IS NOT NULL
  GROUP BY ct, src, post
  ORDER BY clicks DESC
  LIMIT 100
`;

interface ClickRow {
  ct: string;
  src?: string | null;
  post?: string | null;
  clicks?: number | string;
  clicks_all?: number | string;
  people?: number | string;
}

export interface AcquisitionPost {
  ct: string;
  src: string | null;
  post: string | null;
  clicks: number;
  clicksAll: number;
  people: number;
  installs?: number | null;
  conversion: number | null;
}

export type AcquisitionPanel =
  | { configured: false; missing: string[] }
  | {
      configured: true;
      generatedAt: string;
      windowDays: number;
      installs: { daily: DailyDownload[]; firstTimeTotal: number; error: string | null };
      attribution: { state: AttributionState; note: string | null; feedStopped: boolean | null };
      sources: { referrers: Referrer[]; attributedFirstTime: number };
      posts: AcquisitionPost[];
      errors: string[];
    };

export type Env = Record<string, string | undefined>;

type Settled<T> = { ok: true; value: T } | { ok: false; error: string };

async function settle<T>(
  label: string,
  missing: string[],
  read: () => Promise<T>,
): Promise<Settled<T>> {
  if (missing.length) {
    return { ok: false, error: `${label}: not configured — missing ${missing.join(", ")}` };
  }
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    return { ok: false, error: `${label}: ${(error as Error).message}` };
  }
}

export async function acquisition(env: Env): Promise<AcquisitionPanel> {
  const asc = {
    keyId: env.ASC_KEY_ID as string,
    issuerId: env.ASC_ISSUER_ID as string,
    privateKey: env.ASC_PRIVATE_KEY as string,
    vendorNumber: env.ASC_VENDOR_NUMBER as string,
    appId: env.ASC_APP_ID as string,
  };
  const posthog = {
    host: env.POSTHOG_HOST as string,
    projectId: env.POSTHOG_PROJECT_ID as string,
    apiKey: env.POSTHOG_API_KEY as string,
  };

  const ascMissing = [
    !asc.keyId && "ASC_KEY_ID",
    !asc.issuerId && "ASC_ISSUER_ID",
    !asc.privateKey && "ASC_PRIVATE_KEY",
    !asc.vendorNumber && "ASC_VENDOR_NUMBER",
    !asc.appId && "ASC_APP_ID",
  ].filter((x): x is string => Boolean(x));
  const posthogMissing = [
    !posthog.apiKey && "POSTHOG_API_KEY",
    !posthog.projectId && "POSTHOG_PROJECT_ID",
    !posthog.host && "POSTHOG_HOST",
  ].filter((x): x is string => Boolean(x));

  if (ascMissing.length && posthogMissing.length) {
    return { configured: false, missing: [...ascMissing, ...posthogMissing] };
  }

  const [clicks, downloads, campaigns] = await Promise.all([
    settle("PostHog", posthogMissing, () => hogql<ClickRow>(posthog, CLICKS_BY_CAMPAIGN)),
    settle("Sales Reports", ascMissing, () => dailyDownloads(asc, WINDOW_DAYS)),
    settle("Analytics Reports", ascMissing, () => downloadSources(asc)),
  ]);

  const byCampaign = new Map(
    campaigns.ok ? campaigns.value.campaigns.map((c) => [c.campaign, c.downloads]) : [],
  );
  const attributed = campaigns.ok && campaigns.value.state === "ready";

  const posts: AcquisitionPost[] = (clicks.ok ? clicks.value : []).map((row) => {
    const found = byCampaign.get(row.ct);
    const installs = attributed ? (found ?? null) : undefined;
    return {
      ct: row.ct,
      src: row.src ?? null,
      post: row.post ?? null,
      clicks: Number(row.clicks ?? 0),
      clicksAll: Number(row.clicks_all ?? 0),
      people: Number(row.people ?? 0),
      installs,
      conversion: installs && row.clicks ? installs / Number(row.clicks) : null,
    };
  });

  const daily = downloads.ok ? downloads.value : [];
  const firstTimeTotal = daily.reduce((sum, d) => sum + (d.firstTime ?? 0), 0);

  return {
    configured: true,
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    installs: {
      daily,
      firstTimeTotal,
      error: downloads.ok ? null : downloads.error,
    },
    attribution: {
      state: campaigns.ok ? campaigns.value.state : "error",
      note: campaigns.ok ? (campaigns.value.note ?? null) : campaigns.error,
      feedStopped: campaigns.ok ? (campaigns.value.stopped ?? false) : null,
    },
    sources: {
      referrers: campaigns.ok ? campaigns.value.referrers : [],
      attributedFirstTime: campaigns.ok ? campaigns.value.attributedFirstTime : 0,
    },
    posts,
    errors: [clicks, downloads, campaigns].filter((r) => !r.ok).map((r) => r.error),
  };
}
