"use client";

/**
 * Audible alerting and the mutes that make it safe to switch on.
 *
 * Sound is the only thing on this dashboard that can reach an operator who is
 * looking at a different monitor, which is most of the time. It is also the
 * fastest way to get a monitoring tool switched off for good, so three rules
 * hold it in place.
 *
 * It is off until someone turns it on. A tool that starts making noise on first
 * load gets muted before it has earned anything.
 *
 * A mute always expires. A permanent mute is indistinguishable from a broken
 * camera, and it is invisible six weeks later when it matters.
 *
 * A mute is always visible while it is in force. The top bar carries a count,
 * because the dangerous state is not "muted", it is "muted and forgotten".
 */

const SOUND_KEY = "ridgeline.sound";
const MUTE_KEY = "ridgeline.mutes";
const EVENT = "ridgeline:alerting";

export type Mutes = Record<string, number>;

/** Mute durations offered in the interface, in minutes. */
export const MUTE_CHOICES = [15, 60, 240] as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private browsing. The preference is lost, the alerting still works. */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribe(fn: () => void) {
  window.addEventListener(EVENT, fn);
  // Another tab of the same dashboard is a normal thing on a watch floor.
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

export function soundOn(): boolean {
  return read<boolean>(SOUND_KEY, false);
}

export function setSoundOn(on: boolean) {
  write(SOUND_KEY, on);
}

/** Mutes that have not expired, with the expired ones swept as a side effect. */
export function activeMutes(now = Date.now()): Mutes {
  const all = read<Mutes>(MUTE_KEY, {});
  const live: Mutes = {};
  let changed = false;
  for (const [id, until] of Object.entries(all)) {
    if (until > now) live[id] = until;
    else changed = true;
  }
  if (changed) write(MUTE_KEY, live);
  return live;
}

export function muteCamera(cameraId: string, minutes: number) {
  write(MUTE_KEY, { ...activeMutes(), [cameraId]: Date.now() + minutes * 60_000 });
}

export function unmuteCamera(cameraId: string) {
  const next = activeMutes();
  delete next[cameraId];
  write(MUTE_KEY, next);
}

let context: AudioContext | null = null;

/**
 * Two short rising pulses, generated rather than shipped as a file.
 *
 * Deliberately plain. A pleasant chime gets learned as background, and a siren
 * gets muted the first time it fires on cirrus. This is closer to a bench
 * instrument: short, dry, and unmistakably not a notification from something
 * else on the desk.
 */
export function playAlertTone() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context = context ?? new Ctor();
    if (context.state === "suspended") void context.resume();

    const start = context.currentTime;
    [
      { at: 0, hz: 660 },
      { at: 0.22, hz: 880 },
    ].forEach(({ at, hz }) => {
      const osc = context!.createOscillator();
      const gain = context!.createGain();
      osc.type = "triangle";
      osc.frequency.value = hz;
      // A hard edge on either end clicks, so the envelope opens and closes over
      // fifteen milliseconds.
      gain.gain.setValueAtTime(0, start + at);
      gain.gain.linearRampToValueAtTime(0.18, start + at + 0.015);
      gain.gain.setValueAtTime(0.18, start + at + 0.15);
      gain.gain.linearRampToValueAtTime(0, start + at + 0.17);
      osc.connect(gain).connect(context!.destination);
      osc.start(start + at);
      osc.stop(start + at + 0.2);
    });
  } catch {
    /* no audio device, or the browser refused. Silence is the correct fallback. */
  }
}

/** Unlocks audio on the click that turns sound on, which is the required gesture. */
export function primeAudio() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context = context ?? new Ctor();
    void context.resume();
  } catch {
    /* see above */
  }
}

export function notify(title: string, body: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    // Tagged by camera so a second confirmation replaces the first rather than
    // stacking a wall of them on the operating system.
    new Notification(title, { body, tag: "ridgeline-" + title, renotify: false } as NotificationOptions);
  } catch {
    /* notifications are a courtesy, never the alert itself */
  }
}
