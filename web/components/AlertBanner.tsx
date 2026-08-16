"use client";

import Link from "next/link";
import { useState } from "react";

import type { CameraRow } from "@/lib/queries";
import { MUTE_CHOICES, activeMutes, muteCamera } from "@/lib/alerting";
import { isOpen } from "@/lib/verdicts";

import { TimeAgo } from "./TimeAgo";
import { VerdictActions } from "./VerdictActions";

/**
 * Shown only while a confirmation is still unanswered.
 *
 * This is the single element allowed to float above the page, because it is the
 * single element whose job is to interrupt. Two rules govern it.
 *
 * It names the camera, the confidence and the number of consecutive frames, so
 * the operator can judge the claim rather than only receive it.
 *
 * And it can be answered. An alert with no way to close it teaches the room to
 * ignore the next one, which is the failure mode that quietly kills monitoring
 * tools. Answering it does not change what the model said: the camera stays
 * confirmed and the tile stays red, because the scores have not changed. It
 * changes only whether the system is still asking someone to look.
 */
export function AlertBanner({ cameras }: { cameras: CameraRow[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [muting, setMuting] = useState(false);

  const open = cameras.filter(
    (c) =>
      c.state === "confirmed" &&
      isOpen(c.detectionVerdict) &&
      !(c.detectionId && dismissed.has(c.detectionId)),
  );
  if (open.length === 0) return null;

  const [first] = open;
  const others = open.length - 1;

  return (
    <div className="banner" role="alert">
      <div className="banner-text">
        <div className="banner-headline">
          {open.length === 1
            ? `Smoke confirmed at ${first.name}`
            : `Smoke confirmed at ${open.length} cameras`}
        </div>
        <div className="data secondary" style={{ marginTop: 4 }}>
          {first.id}
          {first.lat != null && first.lng != null
            ? `  ${first.lat.toFixed(3)}, ${first.lng.toFixed(3)}`
            : ""}
          {"  "}
          confidence {first.confidence.toFixed(2)}
          {"  "}
          {first.consecutiveCount} consecutive frames
          {others > 0 ? `  and ${others} more unanswered` : ""}
          {"  "}
          <TimeAgo iso={first.lastFrameAt} />
        </div>
      </div>

      <div className="banner-actions">
        <Link className="btn" href={`/camera/${first.id}`}>
          Open {first.name}
        </Link>
        {first.detectionId ? (
          <VerdictActions
            detectionId={first.detectionId}
            verdict={first.detectionVerdict}
            compact
            onResolved={() =>
              setDismissed((prev) => new Set(prev).add(first.detectionId as string))
            }
          />
        ) : null}

        {/* Silencing one camera is a different act from answering it. A camera
            that keeps re-confirming while a crew is already on scene should be
            quietened without anyone pretending it has been resolved, and the
            mute always expires. */}
        {muting ? (
          <span className="banner-mute">
            {MUTE_CHOICES.map((m) => (
              <button
                key={m}
                className="btn ghost"
                onClick={() => {
                  muteCamera(first.id, m);
                  setMuting(false);
                }}
              >
                {m < 60 ? m + " min" : m / 60 + " h"}
              </button>
            ))}
          </span>
        ) : (
          <button
            className="btn ghost"
            onClick={() => setMuting(true)}
            disabled={Boolean(activeMutes()[first.id])}
            title="Silence the tone for this camera only, for a set time"
          >
            Mute this camera
          </button>
        )}
      </div>
    </div>
  );
}
