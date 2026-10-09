import type { Reward } from "@latere/core";

const GQL_URL = process.env.BUFFER_GRAPHQL_URL ?? "https://api.buffer.com";

export function hasToken(): boolean {
  return Boolean(process.env.BUFFER_ACCESS_TOKEN);
}

interface GqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function gql<T>(query: string, variables: Record<string, unknown>, attempt = 0): Promise<T> {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  if (!token) throw new Error("BUFFER_ACCESS_TOKEN not set");
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 429) {
    const ra = Number(res.headers.get("retry-after")) || 3 * (attempt + 1);
    if (attempt < 2 && ra <= 10) {
      await new Promise((r) => setTimeout(r, ra * 1000));
      return gql(query, variables, attempt + 1);
    }
    throw new Error(`Buffer rate limit (429) — retry after ${ra}s`);
  }
  if (!res.ok) throw new Error(`Buffer HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as GqlResponse<T>;
  if (json.errors?.length)
    throw new Error(`Buffer GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
  if (!json.data) throw new Error("Buffer GraphQL: empty response");
  return json.data;
}

export interface BufferChannel {
  id: string;
  service: string;
  name: string;
  displayName?: string | null;
}

export interface BufferAccount {
  id: string;
  timezone?: string | null;
  organizations: Array<{ id: string; name: string }>;
}

export async function getAccount(): Promise<BufferAccount> {
  const d = await gql<{ account: BufferAccount }>(
    `query { account { id timezone organizations { id name } } }`,
    {},
  );
  return d.account;
}

export async function listChannels(organizationId: string): Promise<BufferChannel[]> {
  const d = await gql<{ channels: BufferChannel[] }>(
    `query($input: ChannelsInput!) { channels(input: $input) { id service name displayName } }`,
    { input: { organizationId } },
  );
  return d.channels;
}

export type ShareMode = "addToQueue" | "shareNow" | "shareNext" | "customScheduled";

export interface CreatePostArgs {
  channelId: string;
  text: string;
  mode: ShareMode;
  saveToDraft: boolean;
  dueAt?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  imageUrls?: string[];
  isAiGenerated?: boolean;
  service?: string;
}

function metadataFor(args: CreatePostArgs): Record<string, unknown> | undefined {
  const images = args.imageUrls?.length ?? 0;
  const ai = args.isAiGenerated ? { isAiGenerated: true } : {};
  switch (args.service) {
    case "instagram":
      return {
        instagram: {
          type: images > 0 ? "post" : "reel",
          shouldShareToFeed: true,
          ...ai,
        },
      };
    case "tiktok":
      return { tiktok: { ...ai } };
    case "youtube":
      return {
        youtube: {
          title: (args.text || "nonyxa").slice(0, 95),
          privacy: "public",
          categoryId: "22",
          madeForKids: false,
          ...ai,
        },
      };
    case "facebook":
      return { facebook: images > 0 ? { type: "post" } : { type: "reel" } };
    default:
      return undefined;
  }
}

export interface CreatedPost {
  id: string;
  status: string;
  dueAt?: string | null;
}

export async function createPost(args: CreatePostArgs): Promise<CreatedPost> {
  const assets: Array<Record<string, unknown>> = args.videoUrl
    ? [
        {
          video: {
            url: args.videoUrl,
            ...(args.thumbnailUrl ? { thumbnailUrl: args.thumbnailUrl } : {}),
          },
        },
      ]
    : (args.imageUrls ?? []).map((url) => ({ image: { url } }));
  const input: Record<string, unknown> = {
    channelId: args.channelId,
    text: args.text,
    mode: args.mode,
    schedulingType: "automatic",
    saveToDraft: args.saveToDraft,
    assets,
  };
  if (args.dueAt) input.dueAt = args.dueAt;
  if (assets.length > 0) {
    const meta = metadataFor(args);
    if (meta) input.metadata = meta;
  }
  const d = await gql<{ createPost: { post?: CreatedPost; message?: string } }>(
    `mutation($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess { post { id status dueAt } }
        ... on InvalidInputError { message }
        ... on UnauthorizedError { message }
        ... on UnexpectedError { message }
        ... on RestProxyError { message }
        ... on LimitReachedError { message }
        ... on NotFoundError { message }
      }
    }`,
    { input },
  );
  const r = d.createPost;
  if (!r.post) throw new Error(`Buffer createPost failed: ${r.message ?? "unknown error"}`);
  return r.post;
}

export interface BufferPost {
  id: string;
  status: string;
  text: string;
  channelService: string;
  channelId: string;
  sentAt?: string | null;
  dueAt?: string | null;
}

export async function listRecentPosts(organizationId: string, first = 50): Promise<BufferPost[]> {
  const d = await gql<{ posts: { edges: Array<{ node: BufferPost }> } }>(
    `query($input: PostsInput!, $first: Int) {
      posts(input: $input, first: $first) {
        edges { node { id status text channelService channelId sentAt dueAt } }
      }
    }`,
    { input: { organizationId }, first },
  );
  return d.posts.edges.map((e) => e.node);
}

export interface PostMetrics {
  status: string;
  metricsUpdatedAt?: string | null;
  metrics: Array<{ type: string; value: number }>;
}

export async function getPostMetrics(postId: string): Promise<PostMetrics> {
  const d = await gql<{ post: PostMetrics }>(
    `query($input: PostInput!) { post(input: $input) { status metricsUpdatedAt metrics { type value } } }`,
    { input: { id: postId } },
  );
  return d.post;
}

type NumericRewardKey =
  | "views"
  | "profile_clicks"
  | "likes"
  | "comments"
  | "shares"
  | "saves"
  | "follows";

const METRIC_MAP: Record<string, NumericRewardKey> = {
  views: "views",
  impressions: "views",
  clicks: "profile_clicks",
  likes: "likes",
  reactions: "likes",
  comments: "comments",
  shares: "shares",
  reposts: "shares",
  saves: "saves",
  follows: "follows",
};

export function metricsToReward(pm: PostMetrics): Reward {
  const reward: Reward = {};
  let sawViews = false;
  for (const m of pm.metrics) {
    const key = METRIC_MAP[m.type];
    if (!key) continue;
    if (key === "views") {
      if (m.type === "views") {
        reward.views = m.value;
        sawViews = true;
      } else if (!sawViews) {
        reward.views = m.value;
      }
      continue;
    }
    reward[key] = m.value;
  }
  if (pm.metricsUpdatedAt) reward.measured_at = pm.metricsUpdatedAt;
  return reward;
}
