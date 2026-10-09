import type { Reward } from "./types";

export const CAPTION_STYLES = ["bold_center", "subtle_lower"] as const;

export interface PolicyOpts {
  batchSize: number;
  exploit: number;
  explore: number;
  rewardKey: keyof Reward;
}

export const DEFAULT_POLICY: PolicyOpts = {
  batchSize: 6,
  exploit: 0.5,
  explore: 0.3,
  rewardKey: "views",
};
