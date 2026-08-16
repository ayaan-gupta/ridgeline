"use client";

import { useEffect, useState } from "react";

import {
  activeMutes,
  primeAudio,
  playAlertTone,
  setSoundOn,
  soundOn,
  subscribe,
  unmuteCamera,
} from "@/lib/alerting";

/**
 * The audible alerting control, in the top bar next to the position label.
 *
 * Turning it on plays the tone once. That is not a flourish: it is the only
 * honest way to let somebody find out what the room is about to sound like at
 * three in the morning, and the click doubles as the gesture browsers require
 * before any audio can play at all.
 */
export function AlertSound() {
  const [on, setOn] = useState(false);
  const [muted, setMuted] = useState<string[]>([]);
  const [permission, setPermission] = useState<string>("default");

  useEffect(() => {
    const sync = () => {
      setOn(soundOn());
      setMuted(Object.keys(activeMutes()));
      if (typeof Notification !== "undefined") setPermission(Notification.permission);
    };
    sync();
    const stop = subscribe(sync);
    const timer = setInterval(sync, 15_000);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, []);

  async function toggle() {
    const next = !on;
    setSoundOn(next);
    if (next) {
      primeAudio();
      playAlertTone();
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        setPermission(await Notification.requestPermission());
      }
    }
  }

  return (
    <div className="alertsound">
      <button
        className="btn ghost alertsound-btn"
        onClick={toggle}
        aria-pressed={on}
        title={
          on
            ? "Audible alerts are on. Turning them off silences every camera."
            : "Play a tone when a camera is confirmed. Plays once now so you know the sound."
        }
      >
        {on ? "Sound on" : "Sound off"}
      </button>

      {/* The dangerous state is not muted, it is muted and forgotten, so the
          count is always visible and always clickable. */}
      {muted.length > 0 ? (
        <button
          className="alertsound-muted data-sm"
          onClick={() => muted.forEach(unmuteCamera)}
          title={"Muted: " + muted.join(", ") + ". Click to unmute all."}
        >
          {muted.length} muted
        </button>
      ) : null}

      {on && permission === "denied" ? (
        <span className="data-sm muted" title="The browser is blocking notifications for this site.">
          tone only
        </span>
      ) : null}
    </div>
  );
}
