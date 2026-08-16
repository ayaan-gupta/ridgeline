"use client";

import { useCallback, useRef, useState } from "react";

import { TimeAgo } from "./TimeAgo";

/**
 * The current frame against the frame the scorer is comparing it to.
 *
 * This is the judgment an operator is actually making. Not "is there smoke in
 * this photograph", which is hard, but "does this differ from what this camera
 * normally looks like", which is easy once both images are in front of you. The
 * model has always had both halves. Until now the person did not.
 *
 * A wipe rather than two images side by side. Side by side asks the eye to hold
 * one frame in memory while it looks at the other, and a plume against a hazy
 * ridge is exactly the kind of low contrast difference that survives that trip.
 * Wiping puts the difference in the same pixels.
 */
export function ReferenceCompare({
  currentSrc,
  referenceSrc,
  referenceCapturedAt,
  cameraName,
  bbox,
  state,
}: {
  currentSrc: string;
  referenceSrc: string;
  referenceCapturedAt: string | null;
  cameraName: string;
  bbox: { x: number; y: number; w: number; h: number } | null;
  state: string;
}) {
  const [split, setSplit] = useState(50);
  const wrap = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const moveTo = useCallback((clientX: number) => {
    const el = wrap.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSplit(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  }, []);

  return (
    <div className="compare">
      <div
        className="compare-stage"
        ref={wrap}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          moveTo(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && moveTo(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <img className="compare-img" src={currentSrc} alt={`Current frame from ${cameraName}`} />

        {/* The reference sits on top, clipped to the left of the handle, so the
            left of the image is always "how it usually looks" and the right is
            always "now". */}
        <img
          className="compare-img compare-ref"
          src={referenceSrc}
          alt={`The known clear reference frame for ${cameraName}`}
          style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
        />

        {/* Drawn over the current side only. A box floating over the reference
            would be claiming the model found something in a frame it uses as
            its definition of nothing. */}
        {bbox ? (
          <span
            className="bbox"
            data-state={state}
            style={{
              left: `${bbox.x * 100}%`,
              top: `${bbox.y * 100}%`,
              width: `${bbox.w * 100}%`,
              height: `${bbox.h * 100}%`,
              clipPath: `inset(0 0 0 ${Math.max(0, (split - bbox.x * 100) / (bbox.w * 100)) * 100}%)`,
            }}
          />
        ) : null}

        <span className="compare-handle" style={{ left: `${split}%` }} aria-hidden="true" />

        <span className="compare-tag compare-tag-left">reference</span>
        <span className="compare-tag compare-tag-right">now</span>
      </div>

      <label className="compare-control">
        <span className="label">Wipe</span>
        <input
          type="range"
          min={0}
          max={100}
          value={split}
          onChange={(e) => setSplit(Number(e.target.value))}
          aria-label={`Wipe between the reference frame and the current frame from ${cameraName}`}
        />
      </label>

      <p className="data-sm muted compare-note">
        The reference is the frame the scorer compares against. It refreshes only
        while the camera is clear and freezes as soon as anything crosses the
        threshold
        {referenceCapturedAt ? (
          <>
            {". Captured "}
            <TimeAgo iso={referenceCapturedAt} />
          </>
        ) : (
          "."
        )}
      </p>
    </div>
  );
}
