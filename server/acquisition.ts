import {
  type AttributionState,
  type DailyDownload,
  dailyDownloads,
  downloadSources,
  type Referrer,
} from "./asc";

export type { AttributionState, Referrer };

const WINDOW_DAYS = 30;

export type AcquisitionPanel =
  | { configured: false; missing: string[] }
  | {
      configured: true;
      generatedAt: string;
      windowDays: number;
      installs: { daily: DailyDownload[]; firstTimeTotal: number; error: string | null };
      attribution: { state: AttributionState; note: string | null; feedStopped: boolean | null };
      sources: { referrers: Referrer[]; attributedFirstTime: number };
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
  const ascMissing = [
    !asc.keyId && "ASC_KEY_ID",
    !asc.issuerId && "ASC_ISSUER_ID",
    !asc.privateKey && "ASC_PRIVATE_KEY",
    !asc.vendorNumber && "ASC_VENDOR_NUMBER",
    !asc.appId && "ASC_APP_ID",
  ].filter((x): x is string => Boolean(x));
  if (ascMissing.length) {
    return { configured: false, missing: ascMissing };
  }

  const [downloads, campaigns] = await Promise.all([
    settle("Sales Reports", ascMissing, () => dailyDownloads(asc, WINDOW_DAYS)),
    settle("Analytics Reports", ascMissing, () => downloadSources(asc)),
  ]);

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
    errors: [downloads, campaigns].filter((r) => !r.ok).map((r) => r.error),
  };
}
