export type Pace = "slow" | "medium" | "fast";
export type VisualDensity = "low" | "medium" | "high";

export type PostStatus =
  | "drafted"
  | "rendered"
  | "review"
  | "rejected"
  | "scheduled"
  | "published"
  | "collected";

export interface Segment {
  role: string;
  shot_id?: string;
}

export interface SlideText {
  body: string;
  role?: "hook" | "beat" | "cta";
  position?: "top" | "center" | "lower";
}

export interface SlideOverlay {
  asset_id?: string;
  url?: string;
  anchor?: string;
  scale?: number;
}

export interface Slide {
  background: { shot_id?: string; url?: string };
  text?: SlideText;
  overlays?: SlideOverlay[];
}

export interface Composition {
  format: string;
  segments: Segment[];
  slides?: Slide[];
  transition?: string;
  caption_position?: string;
  layout?: string;
  music_id?: string;
}

export interface Factors {
  hook_id?: string;
  hook_text?: string;
  hook_type?: string;
  format?: string;
  composition?: Composition;
  opener?: string;
  transition?: string;
  caption_position?: string;
  pace?: Pace;
  visual_density?: VisualDensity;
  length_s?: number;
  aspect?: "9:16" | "4:5";
  slide_count?: number;
  copy_style?: "numbered" | "plain";
  used_tags?: string[];
  caption_style?: string;
  shot_types?: string[];
  app_screen?: string;
  clip_ids?: string[];
  [k: string]: unknown;
}

export interface Publish {
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

export interface Reward {
  views?: number;
  profile_clicks?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  follows?: number;
  measured_at?: string;
}

export interface RenderInfo {
  path?: string;
  url?: string;
  urls?: string[];
  render_spec?: Record<string, unknown>;
}

export interface LedgerRecord {
  id: string;
  created_at: string;
  status: PostStatus;
  factors: Factors;
  embedding?: number[] | null;
  render?: RenderInfo;
  publish?: Publish;
  publishes?: PublishInstance[];
  reward?: Reward;
  rejected_reason?: string;
  confounds?: string[];
}

export type RequestStatus = "open" | "captured" | "indexed" | "declined";

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
  fulfilled_by: string[];
  notes?: string;
  shot_type?: string;
  target_region?: Partial<Factors>;
}

export interface Hook {
  id: string;
  type: string;
  text: string;
  notes?: string;
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

export interface RoleSlot {
  role: string;
  match_tags_any?: string[];
  required?: boolean;
}

export interface FormatPermute {
  order?: boolean;
  transition?: string[];
  caption_position?: string[];
  layout?: string[];
}

export interface Format {
  id: string;
  label: string;
  kind?: "video" | "slideshow";
  hook_types?: string[];
  duration_s: [number, number];
  slides?: [number, number];
  segments: RoleSlot[];
  caption: "always" | "optional" | "none";
  deferred?: boolean;
  permute?: FormatPermute;
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

export interface ShotType {
  id: string;
  label: string;
  category: string;
  description: string;
  needs_footage?: boolean;
  needs_app_screen?: boolean;
}

export interface Clip {
  id: string;
  path?: string;
  drive_file_id?: string;
  shot_type: string;
  app_screen?: string;
  duration_s?: number;
  tags?: string[];
  notes?: string;
}
