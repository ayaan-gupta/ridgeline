"use client";

import Link from "next/link";

import type { CameraRow } from "@/lib/queries";
import type { RiskState } from "@/lib/risk";
import { VERDICT_LABEL, isOpen, type Verdict } from "@/lib/verdicts";

import { FrameImage } from "./FrameImage";
import { FrameStrip } from "./FrameStrip";
import { StateChip } from "./StateChip";

const COMPASS: Record<number, string> = {
  0: "N",
  45: "NE",
  90: "E",
  135: "SE",
  180: "S",
  225: "SW",
  270: "W",
  315: "NW",
};

export function frameUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  // Frames live on a shared volume at FRAMES_DIR and are served by path below it.
  const rel = storagePath.replace(/^.*?\/frames\//, "");
  return `/api/frames/${rel}`;
}

export function CameraTile({
  camera,
  settings,
  selected = false,
}: {
  camera: CameraRow;
  settings: { threshold: number; consecutive: number };
  selected?: boolean;
}) {
  const src = frameUrl(camera.lastFramePath);
  const state = camera.state as RiskState;
  const bearing = camera.bearingDeg == null ? null : (COMPASS[camera.bearingDeg] ?? `${camera.bearingDeg}`);

  const answered = !isOpen(camera.detectionVerdict);

  return (
    <Link
      className="tile"
      data-state={state}
      data-selected={selected || undefined}
      id={`tile-${camera.id}`}
      href={`/camera/${camera.id}`}
    >
      <div className={`tile-image${state === "offline" ? " is-offline" : ""}`}>
        {src ? (
          <FrameImage src={src} alt={`Most recent frame from ${camera.name}`} />
        ) : (
          <span className="tile-empty">Waiting for the first frame from this camera.</span>
        )}
        {camera.bbox && state !== "offline" ? (
          <span
            className="bbox"
            data-state={state}
            style={{
              left: `${camera.bbox.x * 100}%`,
              top: `${camera.bbox.y * 100}%`,
              width: `${camera.bbox.w * 100}%`,
              height: `${camera.bbox.h * 100}%`,
            }}
          />
        ) : null}
      </div>

      <div className="tile-body">
        <div className="tile-title">
          <span className="tile-name">{camera.name}</span>
          <StateChip
            state={state}
            count={camera.consecutiveCount}
            consecutive={settings.consecutive}
          />
        </div>

        <div className="tile-meta data-sm">
          <span>{camera.id}</span>
          {bearing ? <span>{bearing}</span> : null}
          {camera.elevationM ? <span>{camera.elevationM}m</span> : null}
          <span>{camera.confidence.toFixed(2)}</span>
        </div>

        <FrameStrip
          scores={camera.scores}
          state={state}
          threshold={settings.threshold}
          consecutive={settings.consecutive}
        />

        {/* The verdict sits under the model's claim rather than replacing it.
            A tile a person called a false alarm still shows the state the
            scores produced, because hiding that would make the disagreement
            impossible to review later. */}
        {answered && (state === "confirmed" || state === "watching") ? (
          <span className="tile-verdict data-sm" data-verdict={camera.detectionVerdict}>
            {VERDICT_LABEL[camera.detectionVerdict as Verdict] ?? camera.detectionVerdict}
            {camera.resolvedBy ? ` by ${camera.resolvedBy}` : ""}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
