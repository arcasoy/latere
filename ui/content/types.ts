type Pace = "slow" | "medium" | "fast";

type PostStatus =
  | "drafted"
  | "rendered"
  | "review"
  | "rejected"
  | "scheduled"
  | "published"
  | "collected";

interface Segment {
  role: string;
  shot_id?: string;
}

interface Composition {
  format: string;
  segments: Segment[];
  transition?: string;
  caption_position?: string;
  layout?: string;
  music_id?: string;
}

interface Factors {
  hook_id?: string;
  hook_text?: string;
  hook_type?: string;
  format?: string;
  composition?: Composition;
  opener?: string;
  transition?: string;
  caption_position?: string;
  pace?: Pace;
  length_s?: number;
  used_tags?: string[];
  caption_style?: string;
  shot_types?: string[];
  app_screen?: string;
  [k: string]: unknown;
}

interface Publish {
  channel?: string;
  channel_id?: string;
  buffer_post_id?: string;
  scheduled_at?: string;
  published_at?: string;
}

export interface PublishInstance {
  channel: string;
  channel_id?: string;
  buffer_post_id?: string;
  status?: PostStatus;
  scheduled_at?: string;
  published_at?: string;
  reward?: Reward;
}

interface Reward {
  views?: number;
  profile_clicks?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  follows?: number;
  measured_at?: string;
}

export interface LedgerRecord {
  id: string;
  created_at: string;
  status: PostStatus;
  factors: Factors;
  embedding?: number[] | null;
  render?: {
    path?: string;
    url?: string;
    urls?: string[];
    render_spec?: Record<string, unknown>;
  };
  rejected_reason?: string;
  publish?: Publish;
  publishes?: PublishInstance[];
  reward?: Reward;
  confounds?: string[];
}

type RequestStatus = "open" | "captured" | "indexed" | "declined";

export interface CaptureRequest {
  id: string;
  created_at: string;
  role?: string;
  want_tags?: string[];
  app_screen?: string;
  format_context?: string;
  quantity: number;
  priority: number;
  rationale: string;
  status: RequestStatus;
  fulfilled_by?: string[];
  notes?: string;
  shot_type?: string;
}

export interface Tag {
  id: string;
  group: string;
  label: string;
  description?: string;
}

export interface Role {
  id: string;
  label: string;
  description?: string;
  generated?: boolean;
}

interface RoleSlot {
  role: string;
  match_tags_any?: string[];
  required?: boolean;
}

export interface Format {
  id: string;
  label: string;
  duration_s: [number, number];
  segments: RoleSlot[];
  caption: string;
  deferred?: boolean;
  permute?: {
    order?: boolean;
    transition?: string[];
    caption_position?: string[];
    layout?: string[];
  };
}

export interface AppScreen {
  id: string;
  label: string;
  description: string;
}

export interface Shot {
  id: string;
  key: string;
  url: string;
  kind?: "video" | "image";
  tags: string[];
  app_screen?: string;
  duration_s?: number;
  orientation?: "vertical" | "horizontal" | "square";
  has_audio?: boolean;
  source?: string;
  notes?: string;
  created_at: string;
}
