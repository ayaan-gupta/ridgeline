"use client";

import { useEffect, useRef, useState } from "react";

import { useScrollProgress } from "./motion";

const STEPS = [
  {
    label: "capture",
    title: "A frame arrives",
    body: "One image per camera per minute. The worker writes it to disk and hands the newest five to the scorer.",
  },
  {
    label: "crop",
    title: "The region of interest",
    body: "The burned-in timestamp at the top and the foreground ridge at the bottom are cut away. Both change every frame for reasons that have nothing to do with fire.",
  },
  {
    label: "background",
    title: "A frozen reference",
    body: "The background comes from known-clear frames and stays there. Rebuild it from a rolling window and a slow plume quietly erases its own signal within minutes.",
  },
  {
    label: "response",
    title: "Changing and losing colour",
    body: "The frame is cut into tiles. A tile scores only if it is both moving against the reference and desaturating, because smoke veils what is behind it. Either one alone is a bird or it is haze.",
  },
  {
    label: "reject",
    title: "Throw out the sun",
    body: "Clipped tiles score zero. A low sun in frame changes shape every minute and is the worst false positive these cameras produce. Real smoke is translucent, so it is never a blown highlight.",
  },
  {
    label: "decide",
    title: "Three frames, then the alert",
    body: "One frame over the line is a candidate. Three consecutive is a detection. The alert fires once, on the frame the run completes, and never again for that run.",
  },
];

/**
 * The pipeline, read horizontally under vertical scroll.
 *
 * A vertical list of six cards would be the ordinary way to do this, and it
 * would also be the icon-grid feature block that PRD 17.3 rules out. Moving
 * sideways matches what the content is: a sequence with a direction, where
 * every step happens to one frame on its way to a decision.
 */
export function Pipeline() {
  const [ref, progress] = useScrollProgress<HTMLDivElement>();
  const track = useRef<HTMLDivElement>(null);
  // The step is measured off the rendered card rather than recomputed in CSS.
  // Expressing it as calc over a min() and a clamp resolved to the wrong length,
  // and a track that drifts out of step with its own counter is worse than a
  // resize listener.
  const [step, setStep] = useState(0);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => {
      const first = el.firstElementChild as HTMLElement | null;
      const second = el.children[1] as HTMLElement | undefined;
      if (!first) return;
      setStep(second ? second.offsetLeft - first.offsetLeft : first.offsetWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Eased at both ends so the track is readable when it arrives and when it
  // leaves, rather than already halfway through.
  const eased = Math.min(1, Math.max(0, (progress - 0.12) / 0.76));
  // Rounded against the same mapping the track uses. Dividing the counter by
  // six and the travel by five drifts them apart by a whole card near the end.
  const active = Math.round(eased * (STEPS.length - 1));

  return (
    <div className="pipe" ref={ref} style={{ height: STEPS.length * 55 + "vh" }}>
      <div className="pipe-stage">
        <div className="pipe-head">
          <span className="micro">how a frame becomes an alert</span>
          <span className="pipe-count data">
            {String(active + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
          </span>
        </div>

        <div className="pipe-rail" aria-hidden="true">
          <span className="pipe-rail-fill" style={{ transform: "scaleX(" + eased + ")" }} />
        </div>

        {/* Translated by card widths rather than by a percentage. A percentage
            here resolves against the track, which is six cards wide, so the
            counter and the card under it drift apart immediately. */}
        <div
          className="pipe-track"
          ref={track}
          style={{ transform: "translate3d(" + -eased * (STEPS.length - 1) * step + "px,0,0)" }}
        >
          {STEPS.map((s, i) => (
            <article className="pipe-card" key={s.label} data-on={i === active || undefined}>
              <span className="micro pipe-card-label">{s.label}</span>
              <h3 className="pipe-card-title">{s.title}</h3>
              <p className="pipe-card-body">{s.body}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
