import type { LedgerRecord, PublishInstance } from "./types";

export interface DecoratedPost extends LedgerRecord {
  postTime: number;
  gapSincePrevMs: number | null;
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

function postTimeMs(r: LedgerRecord): number {
  const inst = publishInstances(r)[0];
  const t =
    inst?.published_at ??
    inst?.scheduled_at ??
    r.publish?.published_at ??
    r.publish?.scheduled_at ??
    r.created_at;
  return new Date(t).getTime();
}

export function decoratePosts(records: LedgerRecord[]): DecoratedPost[] {
  const asc = records
    .map((r) => ({ ...r, postTime: postTimeMs(r), gapSincePrevMs: null as number | null }))
    .sort((a, b) => a.postTime - b.postTime);

  asc.forEach((r, i) => {
    const prev = asc[i - 1];
    r.gapSincePrevMs = prev ? r.postTime - prev.postTime : null;
  });

  return asc.sort((a, b) => b.postTime - a.postTime);
}

export function timeSinceLastPostMs(posts: DecoratedPost[], now: number): number | null {
  const times = posts
    .map((p) => p.publish?.published_at)
    .filter((t): t is string => !!t)
    .map((t) => new Date(t).getTime());
  if (times.length === 0) return null;
  return now - Math.max(...times);
}

export function avgCadenceMs(posts: DecoratedPost[]): number | null {
  const gaps = posts.map((p) => p.gapSincePrevMs).filter((g): g is number => g != null);
  if (gaps.length === 0) return null;
  return gaps.reduce((a, b) => a + b, 0) / gaps.length;
}
