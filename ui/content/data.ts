import type { AppScreen, CaptureRequest, Format, LedgerRecord, Role, Tag } from "./types";

export interface LatereData {
  ledger: LedgerRecord[];
  requests: CaptureRequest[];
  tags: Tag[];
  roles: Role[];
  formats: Format[];
  appScreens: AppScreen[];
  error: string | null;
}

interface ApiData {
  ledger?: LedgerRecord[];
  requests?: CaptureRequest[];
  tags?: Tag[];
  roles?: Role[];
  formats?: Format[];
  appScreens?: AppScreen[];
}

const empty = (error: string | null): LatereData => ({
  ledger: [],
  requests: [],
  tags: [],
  roles: [],
  formats: [],
  appScreens: [],
  error,
});

export async function loadData(): Promise<LatereData> {
  try {
    const res = await fetch("/api/data", { cache: "no-store" });
    if (!res.ok) return empty(`/api/data returned HTTP ${res.status}`);
    const api = (await res.json()) as ApiData;
    return {
      ledger: api.ledger ?? [],
      requests: api.requests ?? [],
      tags: api.tags ?? [],
      roles: api.roles ?? [],
      formats: api.formats ?? [],
      appScreens: api.appScreens ?? [],
      error: null,
    };
  } catch (e) {
    return empty((e as Error).message);
  }
}
