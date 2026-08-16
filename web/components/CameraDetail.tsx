"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { RiskState } from "@/lib/risk";

import { frameUrl } from "./CameraTile";
import { FrameImage } from "./FrameImage";
import { FrameStrip } from "./FrameStrip";
import { ReferenceCompare } from "./ReferenceCompare";
import { VerdictActions } from "./VerdictActions";
import { StateChip } from "./StateChip";
import { TimeAgo } from "./TimeAgo";

type Detail = Awaited<ReturnType<typeof import("@/lib/queries").getCamera>>;

const COMPASS: Record<number, string> = {
  0: "North", 45: "Northeast", 90: "East", 135: "Southeast",
  180: "South", 225: "Southwest", 270: "West", 315: "Northwest",
};

export function CameraDetail({ initial }: { initial: NonNullable<Detail> }) {
  const [detail, setDetail] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);

  // The detail view refreshes itself so an operator who opened a camera and left
  // it up is looking at the camera, not at a snapshot of it.
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/cameras/${initial.camera.id}`, { cache: "no-store" });
        if (res.ok) setDetail(await res.json());
      } catch {
        /* keep showing what we have */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [initial.camera.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "c") setComparing((v) => !v);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { camera, frames, detections, settings } = detail;
  const state = detail.state as RiskState;
  const shown = frames.find((f) => f.id === selected) ?? frames[0];
  const shownSrc = frameUrl(shown?.storagePath ?? null);
  const latestDetection = detections[0];
  const bbox =
    shown && latestDetection && shown.id === latestDetection.frameId
      ? (latestDetection.bbox as { x: number; y: number; w: number; h: number } | null)
      : null;

  const referenceSrc = frameUrl(camera.referenceFramePath ?? null);
  // Comparing an old frame from the strip against the reference would be
  // comparing two moments neither of which is now, so the compare only offers
  // itself on the newest frame.
  const canCompare = Boolean(referenceSrc && shown && shown.id === frames[0]?.id);

  return (
    <main className="page">
      <div className="page-head">
        <Link className="data-sm secondary" href="/watch">
          Cameras
        </Link>
        <h1 className="display-md" style={{ margin: 0 }}>
          {camera.name}
        </h1>
        <StateChip
          state={state}
          count={detail.consecutiveCount}
          consecutive={settings.consecutive}
        />
        <span style={{ marginLeft: "auto" }}>
          <TimeAgo iso={frames[0]?.capturedAt ?? null} />
        </span>
      </div>

      <div className="detail-grid">
        <div>
          {comparing && canCompare && shownSrc && referenceSrc ? (
            <ReferenceCompare
              currentSrc={shownSrc}
              referenceSrc={referenceSrc}
              referenceCapturedAt={camera.referenceCapturedAt ?? null}
              cameraName={camera.name}
              bbox={bbox}
              state={state}
            />
          ) : (
            <div className="detail-image">
              {shownSrc ? (
                <FrameImage src={shownSrc} alt={`Frame from ${camera.name}`} />
              ) : (
                <span className="tile-empty">Waiting for the first frame from this camera.</span>
              )}
              {bbox ? (
                <span
                  className="bbox"
                  data-state={state}
                  style={{
                    left: `${bbox.x * 100}%`,
                    top: `${bbox.y * 100}%`,
                    width: `${bbox.w * 100}%`,
                    height: `${bbox.h * 100}%`,
                  }}
                />
              ) : null}
            </div>
          )}

          <div className="detail-tools">
            <button
              className="btn ghost"
              onClick={() => setComparing((v) => !v)}
              disabled={!canCompare}
              aria-pressed={comparing}
              title={
                canCompare
                  ? "Wipe between this frame and the frame the scorer compares against"
                  : referenceSrc
                    ? "Select the newest frame to compare it against the reference"
                    : "This camera has no reference frame yet"
              }
            >
              {comparing ? "Show the frame" : "Compare with the reference"}
              <kbd>C</kbd>
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="label" style={{ marginBottom: 6 }}>
              Recent frames
            </div>
            <div className="filmstrip">
              {frames.slice(0, 24).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelected(f.id)}
                  aria-pressed={shown?.id === f.id}
                  data-above={f.score != null && f.score >= settings.threshold ? "true" : "false"}
                  title={`${f.label ?? f.id} score ${f.score?.toFixed(3) ?? "none"}`}
                >
                  <img src={frameUrl(f.storagePath) ?? ""} alt="" loading="lazy" />
                  <span className="fs-score">{f.score?.toFixed(2) ?? "--"}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="panel">
            <div className="label" style={{ marginBottom: 10 }}>
              Sliding window
            </div>
            <FrameStrip
              scores={detail.scores}
              state={state}
              threshold={settings.threshold}
              consecutive={settings.consecutive}
            />
            <p className="data-sm secondary" style={{ margin: "10px 0 0" }}>
              A detection is confirmed after {settings.consecutive} frames in a row score at or
              above {settings.threshold.toFixed(2)}. Bars above the line are the frames that
              counted.
            </p>

            {/* The verdict is recorded here, on the screen where the frame and
                the window are both in view. Asking for the answer anywhere else
                would be asking someone to decide from memory. */}
            {latestDetection ? (
              <div className="detail-verdict">
                <div className="label" style={{ marginBottom: 8 }}>
                  Your answer
                </div>
                <VerdictActions
                  detectionId={latestDetection.id}
                  verdict={latestDetection.verdict}
                />
                {latestDetection.note ? (
                  <p className="data-sm muted" style={{ margin: "10px 0 0" }}>
                    {latestDetection.note}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="panel">
            <div className="label" style={{ marginBottom: 10 }}>
              Camera
            </div>
            <div className="facts data-sm">
              <span className="muted">Id</span>
              <span className="data">{camera.id}</span>
              <span className="muted">Network</span>
              <span>{camera.network ?? "unknown"}</span>
              {camera.site ? (
                <>
                  <span className="muted">Site</span>
                  <span>{camera.site}</span>
                </>
              ) : null}
              {camera.bearingDeg != null ? (
                <>
                  <span className="muted">Facing</span>
                  <span>
                    {COMPASS[camera.bearingDeg] ?? `${camera.bearingDeg} degrees`}
                  </span>
                </>
              ) : null}
              {camera.lat != null && camera.lng != null ? (
                <>
                  <span className="muted">Position</span>
                  <span className="data">
                    {camera.lat.toFixed(4)}, {camera.lng.toFixed(4)}
                  </span>
                </>
              ) : null}
              {camera.elevationM ? (
                <>
                  <span className="muted">Elevation</span>
                  <span className="data">{camera.elevationM} m</span>
                </>
              ) : null}
              <span className="muted">Source</span>
              <span>{camera.sourceType === "live" ? "Live feed" : "Replay"}</span>
            </div>
            {camera.attribution ? (
              <p className="data-sm muted" style={{ margin: "12px 0 0" }}>
                {camera.attribution}
              </p>
            ) : null}
          </div>

          <div className="panel">
            <div className="label" style={{ marginBottom: 10 }}>
              Detection history
            </div>
            {detections.length === 0 ? (
              <p className="data-sm muted" style={{ margin: 0 }}>
                Nothing has crossed the threshold on this camera.
              </p>
            ) : (
              <table className="table" style={{ border: "none" }}>
                <tbody>
                  {detections.slice(0, 10).map((d) => (
                    <tr key={d.id}>
                      <td style={{ padding: "6px 0" }}>
                        <span
                          className="chip"
                          data-state={d.status === "confirmed" ? "confirmed" : "watching"}
                        >
                          {d.status === "confirmed" ? "Confirmed" : "Watching"}
                        </span>
                      </td>
                      <td className="data" style={{ padding: "6px 0" }}>
                        {d.confidence.toFixed(3)}
                      </td>
                      <td className="data" style={{ padding: "6px 0" }}>
                        {d.consecutiveCount}x
                      </td>
                      <td style={{ padding: "6px 0", textAlign: "right" }}>
                        <TimeAgo iso={d.createdAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
