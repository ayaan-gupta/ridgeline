"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Motion primitives for the marketing surface only.
 *
 * design-system.md section 8 bans ambient motion in the console and names the
 * four moments where motion is allowed. That rule is about a screen someone
 * reads during an incident, and it still holds there without exception. A
 * landing page is a different room: it is read once, at arm's length, by
 * somebody deciding whether this is serious. Motion is how the argument gets
 * made there.
 *
 * The one rule both rooms share: every effect below collapses to an instant
 * state under prefers-reduced-motion, and none of them ever tint, veil or
 * animate a photograph of the sky.
 */

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(q.matches);
    apply();
    q.addEventListener("change", apply);
    return () => q.removeEventListener("change", apply);
  }, []);
  return reduced;
}

/**
 * Inertial scrolling.
 *
 * The reason award-winning sites feel unlike ordinary ones is almost never the
 * typography, it is that the page carries momentum: scroll position chases the
 * wheel rather than snapping to it. Anduril ships Lenis for this. Sixty lines
 * does the same job without another dependency in a repository meant to be read.
 *
 * The important detail is that this eases `window.scrollTo` rather than
 * translating a wrapper. Translating is the obvious implementation and it
 * quietly destroys `position: sticky`, because a transformed ancestor becomes
 * the containing block for everything inside it. The scrub reel is built on a
 * sticky viewport, so the page really has to scroll.
 *
 * Only the wheel is intercepted. Keyboard, scrollbar dragging and touch keep
 * their native behaviour and simply resynchronise the eased value, because
 * taking those over is how these pages end up unusable for anyone not holding
 * a mouse.
 */
export function SmoothScroll() {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced || window.matchMedia("(pointer: coarse)").matches) return;

    let target = window.scrollY;
    let current = window.scrollY;
    let animating = false;
    let frame = 0;

    const maxScroll = () =>
      Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

    const tick = () => {
      // 0.11 is the smallest value that still feels attached to the wheel.
      // Lower reads as lag rather than weight.
      current += (target - current) * 0.11;
      if (Math.abs(target - current) < 0.4) {
        current = target;
        animating = false;
        window.scrollTo(0, Math.round(current));
        return;
      }
      window.scrollTo(0, Math.round(current));
      frame = requestAnimationFrame(tick);
    };

    const onWheel = (e: WheelEvent) => {
      // Pinch zoom and browser-level gestures arrive as ctrl-wheel. Leave them.
      if (e.ctrlKey) return;
      e.preventDefault();
      target = Math.min(maxScroll(), Math.max(0, target + e.deltaY));
      if (!animating) {
        animating = true;
        frame = requestAnimationFrame(tick);
      }
    };

    // Anything that moved the page by other means becomes the new truth.
    const onScroll = () => {
      if (!animating) {
        target = window.scrollY;
        current = window.scrollY;
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll);
    };
  }, [reduced]);

  return null;
}

/** Fires once when an element first reaches `amount` visibility. */
export function useInView<T extends HTMLElement>(amount = 0.35) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: amount },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [amount, seen]);
  return [ref, seen] as const;
}

/**
 * Continuous 0 to 1 progress of an element through the viewport.
 *
 * 0 when its top edge meets the bottom of the viewport, 1 when its bottom edge
 * meets the top. The scrub reel and the pipeline both read this.
 */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const p = span > 0 ? -r.top / span : 0;
      setProgress(Math.min(1, Math.max(0, p)));
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, []);

  return [ref, progress] as const;
}

/**
 * Line by line mask reveal.
 *
 * Each line sits in a clipping box and slides up into it, staggered. Lines are
 * authored rather than measured, because splitting text by measuring wrap
 * points reflows on every resize and lands a screen reader in a pile of
 * fragments. The whole heading is exposed as one string to assistive
 * technology and the visual split is decorative.
 */
export function RevealLines({
  lines,
  className = "",
  as: Tag = "h2",
  delay = 0,
}: {
  lines: string[];
  className?: string;
  as?: "h1" | "h2" | "h3" | "p";
  delay?: number;
}) {
  const [ref, seen] = useInView<HTMLDivElement>(0.2);
  return (
    <div ref={ref}>
      <Tag className={"reveal " + className} data-seen={seen || undefined}>
        <span className="sr-only">{lines.join(" ")}</span>
        {lines.map((line, i) => (
          <span className="reveal-line" key={i} aria-hidden="true">
            <span style={{ transitionDelay: delay + i * 80 + "ms" }}>{line}</span>
          </span>
        ))}
      </Tag>
    </div>
  );
}

/** Counts a real measurement up when it scrolls into view. */
export function CountUp({
  to,
  decimals = 0,
  duration = 1100,
  suffix = "",
}: {
  to: number;
  decimals?: number;
  duration?: number;
  suffix?: string;
}) {
  const [ref, seen] = useInView<HTMLSpanElement>(0.6);
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!seen) return;
    if (reduced) {
      setValue(to);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Ease out quint. The number lands rather than coasting.
      setValue(to * (1 - Math.pow(1 - t, 5)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [seen, to, duration, reduced]);

  return (
    <span ref={ref}>
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}
