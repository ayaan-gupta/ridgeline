/**
 * Server-side view of the decision rule.
 *
 * The rule itself lives in lib/risk.ts, which is shared with the browser. This
 * module is the only place the configured values are read, and it is imported
 * only from server code. Anything the browser needs is passed to it as data.
 */
import { classify, cameraState, DEFAULT_CONSECUTIVE, DEFAULT_THRESHOLD } from "./risk";

export const CONFIDENCE_THRESHOLD = Number(
  process.env.CONFIDENCE_THRESHOLD ?? DEFAULT_THRESHOLD,
);
export const CONSECUTIVE_FRAMES = Number(
  process.env.CONSECUTIVE_FRAMES ?? DEFAULT_CONSECUTIVE,
);

export type Settings = { threshold: number; consecutive: number };

export const settings: Settings = {
  threshold: CONFIDENCE_THRESHOLD,
  consecutive: CONSECUTIVE_FRAMES,
};

export function classifyConfigured(scores: number[]) {
  return classify(scores, CONFIDENCE_THRESHOLD, CONSECUTIVE_FRAMES);
}

export function cameraStateConfigured(
  scores: number[],
  lastFrameAt: Date | string | null | undefined,
  now?: Date,
) {
  return cameraState(scores, lastFrameAt, CONFIDENCE_THRESHOLD, CONSECUTIVE_FRAMES, now);
}

export * from "./risk";
