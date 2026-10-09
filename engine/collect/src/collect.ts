import {
  aggregateReward,
  type LedgerRecord,
  nowIso,
  type PublishInstance,
  publishInstances,
  readLedger,
  upsertLedger,
} from "@latere/core";
import { getPostMetrics, hasToken, metricsToReward } from "@latere/publish";

export interface CollectResult {
  checked: number;
  updated: number;
  skipped: number;
}

export async function collect(): Promise<CollectResult> {
  const records = await readLedger();
  if (!hasToken()) {
    console.log("[collect] no BUFFER_ACCESS_TOKEN — set it to pull reward from Buffer.");
    return { checked: 0, updated: 0, skipped: records.length };
  }

  let checked = 0;
  let updated = 0;
  let skipped = 0;

  const SIX_HOURS = 6 * 3600_000;
  for (const r of records) {
    const instances = publishInstances(r);
    const hasLive = instances.some(
      (i) => i.buffer_post_id && !i.buffer_post_id.startsWith("dryrun_"),
    );
    if (!hasLive) {
      skipped++;
      continue;
    }
    const next: PublishInstance[] = instances.map((i) => ({ ...i }));
    let changed = false;
    for (let k = 0; k < next.length; k++) {
      const inst = next[k]!;
      const pid = inst.buffer_post_id;
      if (!pid || pid.startsWith("dryrun_")) continue;
      if (
        inst.reward?.measured_at &&
        Date.now() - new Date(inst.reward.measured_at).getTime() < SIX_HOURS
      )
        continue;
      checked++;
      try {
        await new Promise((res) => setTimeout(res, 350));
        const pm = await getPostMetrics(pid);
        const reward = metricsToReward(pm);
        if (Object.keys(reward).length === 0) continue;
        next[k] = {
          ...inst,
          status: "collected",
          reward: { ...inst.reward, ...reward, measured_at: reward.measured_at ?? nowIso() },
        };
        changed = true;
        console.log(
          `[collect] ${inst.channel} ${pid} -> views=${reward.views ?? "-"} likes=${reward.likes ?? "-"} comments=${reward.comments ?? "-"}`,
        );
      } catch (e) {
        console.warn(`[collect] ${inst.channel} ${pid} failed: ${(e as Error).message}`);
      }
    }
    if (changed) {
      const agg = aggregateReward(next);
      const merged: LedgerRecord = {
        ...r,
        status: "collected",
        publishes: next,
        ...(agg ? { reward: agg } : {}),
      };
      await upsertLedger(merged);
      updated++;
    } else {
      skipped++;
    }
  }

  return { checked, updated, skipped };
}
