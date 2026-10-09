import { deleteRecord, readRecords, writeRecord } from "./supabase";
import type { CaptureRequest, LedgerRecord, PublishInstance, Reward } from "./types";

export async function readLedger(): Promise<LedgerRecord[]> {
  return (await readRecords<LedgerRecord>("posts")).sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
}

export async function upsertLedger(rec: LedgerRecord): Promise<void> {
  await writeRecord("posts", rec);
}

export async function removeLedger(id: string): Promise<boolean> {
  return deleteRecord("posts", id);
}

const isReal = (i: PublishInstance): boolean => !i.buffer_post_id?.startsWith("dryrun_");

export function publishInstances(r: LedgerRecord): PublishInstance[] {
  if (r.publishes?.length) return r.publishes.filter(isReal);
  const p = r.publish;
  if (p && (p.buffer_post_id || p.channel) && !p.buffer_post_id?.startsWith("dryrun_")) {
    return [
      {
        channel: p.channel ?? "",
        ...(p.channel_id ? { channel_id: p.channel_id } : {}),
        ...(p.buffer_post_id ? { buffer_post_id: p.buffer_post_id } : {}),
        status: r.status,
        ...(p.scheduled_at ? { scheduled_at: p.scheduled_at } : {}),
        ...(p.published_at ? { published_at: p.published_at } : {}),
        ...(r.reward ? { reward: r.reward } : {}),
      },
    ];
  }
  return [];
}

type NumericRewardKey =
  | "views"
  | "profile_clicks"
  | "likes"
  | "comments"
  | "shares"
  | "saves"
  | "follows";
const REWARD_KEYS: NumericRewardKey[] = [
  "views",
  "profile_clicks",
  "likes",
  "comments",
  "shares",
  "saves",
  "follows",
];

export function aggregateReward(instances: PublishInstance[]): Reward | undefined {
  const out: Reward = {};
  let any = false;
  let latest = "";
  for (const inst of instances) {
    if (!inst.reward) continue;
    for (const k of REWARD_KEYS) {
      const v = inst.reward[k];
      if (typeof v === "number") {
        out[k] = (out[k] ?? 0) + v;
        any = true;
      }
    }
    if (inst.reward.measured_at && inst.reward.measured_at > latest)
      latest = inst.reward.measured_at;
  }
  if (!any) return undefined;
  if (latest) out.measured_at = latest;
  return out;
}

export async function mergePublishInstances(
  id: string,
  incoming: PublishInstance[],
): Promise<LedgerRecord | null> {
  const all = await readLedger();
  const i = all.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const rec = all[i]!;
  const byKey = new Map<string, PublishInstance>();
  for (const inst of [...publishInstances(rec), ...incoming]) {
    const key = inst.buffer_post_id || inst.channel || JSON.stringify(inst);
    byKey.set(key, { ...byKey.get(key), ...inst });
  }
  const publishes = [...byKey.values()];
  const first = publishes[0];
  const liveStatus =
    rec.status === "drafted" || rec.status === "rendered" ? "published" : rec.status;
  const updated: LedgerRecord = {
    ...rec,
    status: liveStatus,
    publishes,
    ...(first
      ? {
          publish: {
            channel: first.channel,
            ...(first.channel_id ? { channel_id: first.channel_id } : {}),
            ...(first.buffer_post_id ? { buffer_post_id: first.buffer_post_id } : {}),
            ...(first.published_at ? { published_at: first.published_at } : {}),
            ...(first.scheduled_at ? { scheduled_at: first.scheduled_at } : {}),
          },
        }
      : {}),
    ...(aggregateReward(publishes) ? { reward: aggregateReward(publishes) } : {}),
  };
  await upsertLedger(updated);
  return updated;
}

export async function readRequests(): Promise<CaptureRequest[]> {
  return readRecords<CaptureRequest>("requests");
}

export async function upsertRequest(rec: CaptureRequest): Promise<void> {
  await writeRecord("requests", rec);
}
