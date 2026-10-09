import {
  type LedgerRecord,
  nowIso,
  type PostStatus,
  type PublishInstance,
  publishInstances,
  readLedger,
  upsertLedger,
} from "@latere/core";
import {
  type BufferPost,
  createPost,
  getAccount,
  hasToken,
  listChannels,
  listRecentPosts,
  type ShareMode,
} from "./buffer";

export type PublishMode = "draft" | "schedule" | "now";

export interface PublishOpts {
  mode?: PublishMode;
  channelId?: string;
  channels?: string[];
  dueAt?: string;
  dryRun?: boolean;
}

function modeToShare(
  mode: PublishMode,
  dueAt?: string,
): { share: ShareMode; saveToDraft: boolean; status: PostStatus } {
  if (mode === "draft") return { share: "addToQueue", saveToDraft: true, status: "drafted" };
  if (mode === "now") return { share: "shareNow", saveToDraft: false, status: "published" };
  return {
    share: dueAt ? "customScheduled" : "addToQueue",
    saveToDraft: false,
    status: "scheduled",
  };
}

async function writeDry(
  record: LedgerRecord,
  mode: PublishMode,
  status: PostStatus,
  dueAt: string | undefined,
  why: string,
): Promise<LedgerRecord> {
  const text = String(record.factors.hook_text ?? record.factors.hook_id ?? "");
  const updated: LedgerRecord = {
    ...record,
    status,
    publish: {
      ...record.publish,
      buffer_post_id: `dryrun_${record.id}`,
      ...(mode === "now" ? { published_at: nowIso() } : {}),
      ...(dueAt ? { scheduled_at: dueAt } : {}),
    },
  };
  await upsertLedger(updated);
  console.log(`[publish:dry-run] ${mode} — "${text.slice(0, 48)}" (${why})`);
  return updated;
}

let channelCache: { at: number; channels: Array<{ id: string; service: string }> } | null = null;

async function cachedChannels(): Promise<Array<{ id: string; service: string }>> {
  if (channelCache && Date.now() - channelCache.at < 300_000) return channelCache.channels;
  const acct = await getAccount();
  const org = acct.organizations[0];
  const channels = org
    ? (await listChannels(org.id)).map((c) => ({ id: c.id, service: c.service }))
    : [];
  channelCache = { at: Date.now(), channels };
  return channels;
}

function envChannels(): string[] | undefined {
  const v = process.env.LATERE_PUBLISH_CHANNELS;
  return v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
}

function channelCaps(): Map<string, number> {
  const m = new Map<string, number>();
  for (const part of (process.env.LATERE_CHANNEL_DAILY_CAPS ?? "").split(",")) {
    const [svc, n] = part.split(":").map((s) => s.trim());
    if (svc && Number.isFinite(Number(n))) m.set(svc.toLowerCase(), Number(n));
  }
  return m;
}

async function underDailyCaps(
  targets: Array<{ id: string; service: string }>,
): Promise<Array<{ id: string; service: string }>> {
  const caps = channelCaps();
  if (caps.size === 0) return targets;
  const history = await readLedger();
  return targets.filter((t) => {
    const cap = caps.get(t.service.toLowerCase());
    if (cap == null) return true;
    const today = new Date().toISOString().slice(0, 10);
    const used = history.reduce(
      (count, record) =>
        count +
        publishInstances(record).filter(
          (instance) =>
            instance.channel === t.service &&
            (instance.published_at ?? instance.scheduled_at ?? record.created_at).slice(0, 10) ===
              today,
        ).length,
      0,
    );
    if (used >= cap) {
      console.log(`[publish] ${t.service} at its daily cap (${used}/${cap}) — skipping`);
      return false;
    }
    return true;
  });
}

async function resolveChannels(
  record: LedgerRecord,
  opts: PublishOpts,
): Promise<Array<{ id: string; service: string }>> {
  if (opts.channelId) return [{ id: opts.channelId, service: record.publish?.channel ?? "" }];
  const envId = process.env.BUFFER_CHANNEL_ID;
  if (envId) return [{ id: envId, service: record.publish?.channel ?? "" }];

  const channels = await cachedChannels();
  const want = opts.channels ?? envChannels();
  if (want?.length) return channels.filter((c) => want.includes(c.service));
  return channels;
}

export async function findBufferInstances(hookText: string): Promise<PublishInstance[]> {
  if (!hasToken() || !hookText.trim()) return [];
  const acct = await getAccount();
  const org = acct.organizations[0];
  if (!org) return [];
  const posts = await listRecentPosts(org.id);
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const want = norm(hookText);
  const rank = (s: string): number =>
    (
      ({ sent: 4, scheduled: 3, sending: 2, needs_approval: 1, draft: 0 }) as Record<string, number>
    )[s] ?? 0;

  const byChannel = new Map<string, BufferPost>();
  for (const p of posts) {
    const t = norm(p.text || "");
    if (!t || !(t === want || t.includes(want) || want.includes(t))) continue;
    const cur = byChannel.get(p.channelService);
    if (!cur || rank(p.status) > rank(cur.status)) byChannel.set(p.channelService, p);
  }

  const mapStatus = (s: string): PostStatus =>
    s === "sent"
      ? "published"
      : s === "draft"
        ? "drafted"
        : s === "scheduled"
          ? "scheduled"
          : "published";
  return [...byChannel.values()].map((p) => ({
    channel: p.channelService,
    buffer_post_id: p.id,
    status: mapStatus(p.status),
    ...(p.sentAt ? { published_at: p.sentAt } : {}),
    ...(p.dueAt ? { scheduled_at: p.dueAt } : {}),
  }));
}

export async function publishVariant(
  record: LedgerRecord,
  opts: PublishOpts = {},
): Promise<LedgerRecord> {
  const mode = opts.mode ?? "draft";
  const { share, saveToDraft, status } = modeToShare(mode, opts.dueAt);

  if (opts.dryRun || !hasToken()) {
    return writeDry(record, mode, status, opts.dueAt, "no BUFFER_ACCESS_TOKEN");
  }

  let targets: Array<{ id: string; service: string }>;
  try {
    targets = await resolveChannels(record, opts);
  } catch (e) {
    console.warn(`[publish] channel lookup failed (${(e as Error).message}) — dry-run`);
    return writeDry(record, mode, status, opts.dueAt, "channel lookup failed");
  }
  targets = await underDailyCaps(targets);
  if (targets.length === 0)
    return writeDry(record, mode, status, opts.dueAt, "no channel under its daily cap");

  const text = String(record.factors.hook_text ?? record.factors.hook_id ?? "");
  const videoUrl = record.render?.url;
  const imageUrls = record.render?.urls;
  const isSlideshow = Boolean(record.factors.composition?.slides?.length);
  if (isSlideshow && (!imageUrls || imageUrls.length === 0)) {
    return writeDry(record, mode, status, opts.dueAt, "slideshow has no hosted slide images");
  }
  const isAiGenerated = record.factors.used_tags?.includes("ai-gen") ?? false;
  const IMAGE_SERVICES = new Set(["instagram", "tiktok", "facebook", "pinterest", "threads"]);
  if (imageUrls?.length && !videoUrl) {
    const skipped = targets.filter((t) => !IMAGE_SERVICES.has(t.service));
    if (skipped.length)
      console.log(
        `[publish] skipping ${skipped.map((t) => t.service).join(", ")} — no image support`,
      );
    targets = targets.filter((t) => IMAGE_SERVICES.has(t.service));
    if (targets.length === 0)
      return writeDry(record, mode, status, opts.dueAt, "no image-capable channel");
  }
  const instances: PublishInstance[] = [];
  for (const ch of targets) {
    try {
      const post = await createPost({
        channelId: ch.id,
        text,
        mode: share,
        saveToDraft,
        dueAt: opts.dueAt,
        ...(videoUrl ? { videoUrl, service: ch.service } : {}),
        ...(!videoUrl && imageUrls?.length
          ? { imageUrls, service: ch.service, isAiGenerated }
          : {}),
      });
      instances.push({
        channel: ch.service,
        channel_id: ch.id,
        buffer_post_id: post.id,
        status,
        ...(mode === "now" ? { published_at: nowIso() } : {}),
        ...(opts.dueAt ? { scheduled_at: opts.dueAt } : {}),
      });
      console.log(
        `[publish:${mode}] ${ch.service} buffer_post_id=${post.id} — "${text.slice(0, 40)}"`,
      );
    } catch (e) {
      console.warn(`[publish] ${ch.service} createPost failed (${(e as Error).message})`);
    }
  }
  if (instances.length === 0)
    return writeDry(record, mode, status, opts.dueAt, "all createPost calls failed");

  const first = instances[0]!;
  const updated: LedgerRecord = {
    ...record,
    status,
    publishes: instances,
    publish: {
      channel: first.channel,
      ...(first.channel_id ? { channel_id: first.channel_id } : {}),
      ...(first.buffer_post_id ? { buffer_post_id: first.buffer_post_id } : {}),
      ...(first.published_at ? { published_at: first.published_at } : {}),
      ...(first.scheduled_at ? { scheduled_at: first.scheduled_at } : {}),
    },
  };
  await upsertLedger(updated);
  return updated;
}
