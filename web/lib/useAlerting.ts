"use client";

import { useEffect, useRef, useState } from "react";

import type { CameraRow } from "./queries";
import { activeMutes, notify, playAlertTone, soundOn, subscribe, type Mutes } from "./alerting";
import { isOpen } from "./verdicts";

/**
 * Rings once for each newly confirmed camera that nobody has answered.
 *
 * "Newly" is doing real work here. The snapshot stream re-sends the whole
 * camera list every few seconds, and a camera stays confirmed for as long as
 * its run holds, so firing on the state would produce a tone every tick for
 * several minutes. It fires on the detection id changing instead, which is the
 * same thing the alert itself fires on: once, at the frame the run completes.
 */
export function useAlerting(cameras: CameraRow[]) {
  const [enabled, setEnabled] = useState(false);
  const [mutes, setMutes] = useState<Mutes>({});
  const announced = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    const sync = () => {
      setEnabled(soundOn());
      setMutes(activeMutes());
    };
    sync();
    const stop = subscribe(sync);
    // Mutes expire on a clock, so the indicator has to re-check without an event.
    const timer = setInterval(sync, 15_000);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const open = cameras.filter(
      (c) => c.state === "confirmed" && isOpen(c.detectionVerdict) && c.detectionId,
    );

    // The first pass after a page load records what is already on screen
    // without announcing it. Opening the dashboard onto an alert that has been
    // sitting there for ten minutes should not sound like a new one.
    if (!primed.current) {
      primed.current = true;
      open.forEach((c) => announced.current.add(c.detectionId as string));
      return;
    }

    const fresh = open.filter((c) => !announced.current.has(c.detectionId as string));
    fresh.forEach((c) => announced.current.add(c.detectionId as string));

    const audible = fresh.filter((c) => !mutes[c.id]);
    if (!enabled || audible.length === 0) return;

    playAlertTone();
    const [first] = audible;
    notify(
      first.name,
      "Smoke confirmed at " +
        first.confidence.toFixed(2) +
        " after " +
        first.consecutiveCount +
        " consecutive frames" +
        (audible.length > 1 ? ", and " + (audible.length - 1) + " more" : ""),
    );
  }, [cameras, enabled, mutes]);

  return { enabled, mutes };
}
