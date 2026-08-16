"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { usePrefersReducedMotion, useScrollProgress } from "./motion";
import type { Reel } from "./types";

/**
 * The centrepiece. Scroll advances a real fire, frame by frame, and the model's
 * real confidence advances with it.
 *
 * Every number on this reel came out of model/build_reel.py, which runs the
 * identical loop the replay worker runs: same five frame window, same frozen
 * background, same region of interest, same threshold. Nothing here is drawn to
 * look convincing. That is the entire point of building it this way, because
 * this page is arguing that the temporal rule is the product, and an argument
 * illustrated with invented numbers is an advertisement.
 *
 * A canvas rather than thirty five stacked images: swapping the source of one
 * <img> per scroll frame decodes on the main thread and stutters, and stacking
 * them all costs thirty five layers of compositing. Decode once up front, then
 * every scroll frame is a single drawImage.
 */
export function ScrubReel({ reel }: { reel: Reel }) {
  const [wrap, progress] = useScrollProgress<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const images = useRef<HTMLImageElement[]>([]);
  const reduced = usePrefersReducedMotion();

  const [loaded, setLoaded] = useState(0);
  const [failed, setFailed] = useState(false);
  const [rect, setRect] = useState({ x: 0, y: 0, w: 0, h: 0 });

  const frames = reel.frames;
  const total = frames.length;
  const index = Math.min(total - 1, Math.round(progress * (total - 1)));
  const frame = frames[index];
  const ready = loaded >= total;

  // Preload every frame before the reel can run, and report honest progress
  // while it happens.
  useEffect(() => {
    let cancelled = false;
    let done = 0;
    const width = window.innerWidth > 1100 ? 1600 : window.innerWidth > 700 ? 1024 : 640;

    images.current = frames.map((f) => {
      const img = new Image();
      img.decoding = "async";
      img.src = "/api/reel/" + reel.sequence + "/" + encodeURIComponent(f.file) + "?w=" + width;
      const settle = (ok: boolean) => {
        if (cancelled) return;
        if (!ok) setFailed(true);
        done += 1;
        setLoaded(done);
      };
      img.onload = () => settle(true);
      img.onerror = () => settle(false);
      return img;
    });

    return () => {
      cancelled = true;
    };
  }, [frames, reel.sequence]);

  // Draw. Cover-fit, and remember the drawn rectangle so the detection box can
  // be positioned over the image rather than over the canvas.
  useEffect(() => {
    const el = canvas.current;
    const img = images.current[index];
    if (!el || !img || !img.complete || !img.naturalWidth) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (el.width !== cw * dpr || el.height !== ch * dpr) {
      el.width = cw * dpr;
      el.height = ch * dpr;
    }
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const x = (cw - w) / 2;
    const y = (ch - h) / 2;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, x, y, w, h);

    // Offset by where the canvas sits inside the stage. On a phone the canvas
    // is letterboxed to the frame's own aspect instead of filling the viewport,
    // and a box positioned against the stage would drift off the plume.
    const ox = el.offsetLeft + x;
    const oy = el.offsetTop + y;
    setRect((prev) =>
      prev.x === ox && prev.y === oy && prev.w === w && prev.h === h
        ? prev
        : { x: ox, y: oy, w, h },
    );
  }, [index, ready, loaded]);

  const strip = useMemo(() => frames.map((f) => f.score ?? 0), [frames]);
  const pct = Math.round((loaded / total) * 100);

  return (
    <div className="reel" ref={wrap} style={{ height: total * 24 + "vh" }}>
      <div className="reel-stage">
        <canvas className="reel-canvas" ref={canvas} aria-hidden="true" />

        {/* The detection box is positioned against the drawn image, not the
            canvas, so it stays on the plume at every viewport shape. */}
        {frame.bbox && rect.w > 0 && (
          <svg className="reel-box" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
            style={{
              left: rect.x + frame.bbox.x * rect.w,
              top: rect.y + frame.bbox.y * rect.h,
              width: frame.bbox.w * rect.w,
              height: frame.bbox.h * rect.h,
            }}
          >
            <rect
              x="1" y="1" width="98" height="98"
              className={"reel-box-rect " + (reduced ? "instant" : "")}
              data-state={frame.state}
            />
          </svg>
        )}

        <div className="reel-hud" data-state={frame.state}>
          <div className="reel-hud-top">
            <span className="micro">{reel.camera.name}</span>
            <span className="micro dim">
              {reel.camera.lat.toFixed(5)}, {reel.camera.lng.toFixed(5)}
            </span>
            <span className="micro dim">{reel.camera.elevation_m} m</span>
            <span className="micro dim">bearing {reel.camera.bearing_deg}</span>
          </div>

          <div className="reel-readout">
            <div className="reel-clock">
              <span className="micro dim">from ignition</span>
              <span className="reel-clock-value">{signedClock(frame.t)}</span>
            </div>
            <div className="reel-score">
              <span className="micro dim">confidence</span>
              <span className="reel-score-value">
                {frame.score === null ? "no window" : frame.score.toFixed(2)}
              </span>
            </div>
            <div className="reel-run">
              <span className="micro dim">consecutive</span>
              <span className="reel-run-value">
                {Math.min(frame.run, reel.consecutive)} of {reel.consecutive}
              </span>
            </div>
            <span className={"reel-state s-" + frame.state}>{frame.state}</span>
          </div>

          {/* The frame strip from design-system.md section 7, at reel scale. It
              fills in as you scroll, so the decision rule is visible rather
              than asserted. */}
          <div className="reel-strip" aria-hidden="true">
            <div className="reel-strip-threshold" style={{ bottom: reel.threshold * 100 + "%" }}>
              <span className="micro">{reel.threshold.toFixed(2)}</span>
            </div>
            {strip.map((s, i) => (
              <span
                key={i}
                className="reel-bar"
                data-past={i <= index || undefined}
                data-over={i <= index && s >= reel.threshold ? frames[i].state : undefined}
                style={{ height: Math.max(1.5, (i <= index ? s : 0) * 100) + "%" }}
              />
            ))}
          </div>

          <p className="reel-caption" data-state={frame.state}>
            {caption(frame.state, frame, reel)}
          </p>
        </div>

        {!ready && (
          <div className="reel-loading">
            <span className="micro">
              {failed ? "waiting for frames" : "decoding sequence"} {pct}%
            </span>
            <span className="reel-loading-bar" style={{ transform: "scaleX(" + pct / 100 + ")" }} />
            {failed && (
              <span className="micro dim">
                The replay imagery downloads on first run and is not committed to the repository.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function signedClock(seconds: number): string {
  const sign = seconds < 0 ? "-" : "+";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return sign + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function caption(state: string, frame: { score: number | null }, reel: Reel): string {
  if (frame.score === null) {
    return "The window is not full yet. Five frames have to arrive before anything can be scored.";
  }
  if (state === "confirmed") {
    return (
      "Three consecutive frames above the line. The alert goes out here, " +
      Math.round((reel.confirmed_at_seconds ?? 0) / 60) +
      " minutes after ignition."
    );
  }
  if (state === "watching") {
    return "Above the threshold, and nothing has been sent. One frame is not a fire.";
  }
  return "Clear. This is what the camera does for almost every minute of its life.";
}
