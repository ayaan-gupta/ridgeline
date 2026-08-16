"use client";

import { useEffect, useRef } from "react";

import { DEFAULT_CONSECUTIVE, DEFAULT_THRESHOLD, labelRuns, STRIP_LENGTH, type RiskState } from "@/lib/risk";

/**
 * The frame strip. One bar per recent frame, oldest at left, height is that
 * frame's smoke score, with a hairline at the confirmation threshold.
 *
 * This is the signature element, and it is here because the product's real logic
 * is the consecutive-frame rule rather than the model. A confidence number alone
 * hides that logic: an operator cannot tell a growing plume from a bird that
 * crossed the lens, and cannot see why the system stayed quiet through a glare
 * spike. Three bars in a row over the line looks nothing like one spike over the
 * line, and it reads that way across a whole grid without anyone clicking.
 *
 * It also does the accessibility work. Bar height carries the same information
 * as bar color, so the strip is still readable with no color perception at all.
 */
export function FrameStrip({
  scores,
  state,
  threshold = DEFAULT_THRESHOLD,
  consecutive = DEFAULT_CONSECUTIVE,
}: {
  scores: number[];
  state: RiskState;
  threshold?: number;
  consecutive?: number;
}) {
  // `scores` arrives newest first. The strip reads left to right in time.
  const ordered = [...scores].reverse();
  const padded = [
    ...Array(Math.max(0, STRIP_LENGTH - ordered.length)).fill(null),
    ...ordered,
  ] as (number | null)[];

  // Only the newest bar animates in, and only when it is genuinely new.
  const lastSeen = useRef<number | null>(null);
  const isNew = ordered.length > 0 && lastSeen.current !== ordered[ordered.length - 1];
  useEffect(() => {
    lastSeen.current = ordered.length ? ordered[ordered.length - 1] : null;
  });

  const labels = labelRuns(ordered, threshold, consecutive);
  const padding = Math.max(0, STRIP_LENGTH - ordered.length);

  return (
    <div
      className="strip"
      role="img"
      aria-label={
        ordered.length
          ? `Last ${ordered.length} frame scores, newest ${ordered[ordered.length - 1]?.toFixed(2)}, threshold ${threshold}`
          : "No frames scored yet"
      }
    >
      {/* The line and the bars have to agree, or the strip lies about its own
          rule. Bar heights are a percentage of the strip's content box, which is
          the full height less the 3px padding on each side, so the line is
          positioned against that same box rather than against the padded height. */}
      <span
        className="strip-threshold"
        style={{ bottom: `calc(3px + (100% - 6px) * ${threshold})` }}
      />
      {padded.map((score, i) => {
        const isLast = i === padded.length - 1;
        const label = i >= padding ? labels[i - padding] : "below";
        return (
          <span
            key={i}
            className={`strip-bar${isLast && isNew ? " is-new" : ""}`}
            data-above={label === "below" ? "false" : "true"}
            data-state={label === "confirmed" ? "confirmed" : "watching"}
            style={{
              // A frame that scored zero still gets a visible stub, so the strip
              // reads as twelve frames rather than as a gap.
              height: score == null ? 2 : `max(2px, ${(score * 100).toFixed(2)}%)`,
              opacity: score == null ? 0.35 : 1,
            }}
          />
        );
      })}
    </div>
  );
}
