/**
 * Temporal-consistency rule, as pure functions.
 *
 * Deliberately free of any environment or database import so both the server and
 * the browser can use it. Thresholds are always passed in rather than read from
 * the environment here, because only the server can see the environment: if this
 * module read process.env, a configured threshold of 0.7 would confirm at 0.7 on
 * the server while the frame strip drew its line at the 0.6 default, and the
 * picture would quietly disagree with the decision.
 *
 * A single frame above threshold means very little. Glare, a bird, the edge of a
 * cloud catching the sun: all clear 0.6 once and are gone by the next frame.
 * Smoke shows up and stays. So confirmation needs an unbroken run.
 */

export type RiskState = "clear" | "watching" | "confirmed" | "offline";

export const RISK_LABEL: Record<RiskState, string> = {
  clear: "Clear",
  watching: "Watching",
  confirmed: "Confirmed",
  offline: "Offline",
};

/** Ordering for the dashboard: whatever needs attention first sorts first. */
export const STATE_PRIORITY: Record<RiskState, number> = {
  confirmed: 0,
  watching: 1,
  offline: 2,
  clear: 3,
};

/** How many recent frame scores the frame strip shows. */
export const STRIP_LENGTH = 12;

export const DEFAULT_THRESHOLD = 0.6;
export const DEFAULT_CONSECUTIVE = 3;

/** A camera is Offline when nothing has arrived for this long. */
export const STALE_AFTER_MS = 90_000;

/**
 * How many of the most recent frames, counting back from newest, are at or above
 * threshold. The run must be unbroken: one frame below resets it to zero, which
 * is the entire point of the rule. `scores` is newest first.
 */
export function consecutiveAboveThreshold(scores: number[], threshold: number): number {
  let run = 0;
  for (const score of scores) {
    if (score >= threshold) run += 1;
    else break;
  }
  return run;
}

/**
 * Labels each score with what it actually was at the time, given the rule.
 *
 * `scores` is oldest first here, matching the order the strip draws them.
 *
 * A bar is "confirmed" only if it belongs to an unbroken run long enough to have
 * confirmed a detection. Colouring every above-threshold bar with the camera's
 * *current* state is misleading in both directions: a camera that has gone quiet
 * would show a wall of red history, and a camera part-way into a run would show
 * bars as confirmed before anything was confirmed. The run structure is fully
 * recoverable from the scores, so it costs nothing to be accurate.
 */
export function labelRuns(
  scores: number[],
  threshold: number,
  consecutive: number,
): ("below" | "watching" | "confirmed")[] {
  const labels: ("below" | "watching" | "confirmed")[] = scores.map((s) =>
    s >= threshold ? "watching" : "below",
  );

  let start = 0;
  while (start < scores.length) {
    if (labels[start] === "below") {
      start += 1;
      continue;
    }
    let end = start;
    while (end + 1 < scores.length && labels[end + 1] !== "below") end += 1;
    if (end - start + 1 >= consecutive) {
      // Only the frames from the confirming one onward are confirmed. The frames
      // before it were genuinely still just watching when they arrived.
      for (let i = start + consecutive - 1; i <= end; i++) labels[i] = "confirmed";
    }
    start = end + 1;
  }
  return labels;
}

export function classify(
  scores: number[],
  threshold: number,
  consecutive: number,
): { state: Exclude<RiskState, "offline">; consecutiveCount: number } {
  const run = consecutiveAboveThreshold(scores, threshold);
  if (run >= consecutive) return { state: "confirmed", consecutiveCount: run };
  if (run > 0) return { state: "watching", consecutiveCount: run };
  return { state: "clear", consecutiveCount: 0 };
}

/**
 * Whole-camera state, adding the one thing frame scores cannot tell you: whether
 * frames are arriving at all.
 *
 * Offline is deliberately not part of the risk scale. A camera that stopped
 * reporting is an equipment problem, and showing it as an alarm is how a system
 * teaches its operators that alarms are usually nothing.
 */
export function cameraState(
  scores: number[],
  lastFrameAt: Date | string | null | undefined,
  threshold: number,
  consecutive: number,
  now: Date = new Date(),
): { state: RiskState; consecutiveCount: number } {
  if (!lastFrameAt) return { state: "offline", consecutiveCount: 0 };
  const last = typeof lastFrameAt === "string" ? new Date(lastFrameAt) : lastFrameAt;
  if (now.getTime() - last.getTime() > STALE_AFTER_MS) {
    return { state: "offline", consecutiveCount: 0 };
  }
  return classify(scores, threshold, consecutive);
}
