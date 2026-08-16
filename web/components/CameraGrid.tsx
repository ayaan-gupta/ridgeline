"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { RiskState } from "@/lib/risk";
import { useAlerting } from "@/lib/useAlerting";
import { useLiveData, type Snapshot } from "@/lib/useLiveData";
import { useOperator } from "@/lib/useOperator";
import { isOpen, type Verdict } from "@/lib/verdicts";

import { AlertBanner } from "./AlertBanner";
import { CameraTile } from "./CameraTile";

const COUNTED: RiskState[] = ["confirmed", "watching", "offline", "clear"];
const COUNT_LABEL: Record<RiskState, string> = {
  confirmed: "confirmed",
  watching: "watching",
  offline: "offline",
  clear: "clear",
};

const KEY_TO_VERDICT: Record<string, Verdict> = {
  r: "real_fire",
  f: "false_alarm",
  a: "acknowledged",
};

const SHORTCUTS: [string, string][] = [
  ["J or down", "Next camera"],
  ["K or up", "Previous camera"],
  ["Enter", "Open the selected camera"],
  ["R", "Mark the selection a real fire"],
  ["F", "Mark the selection a false alarm"],
  ["A", "Mark the selection seen but undecided"],
  ["Escape", "Clear the selection"],
  ["?", "Show or hide this list"],
];

export function CameraGrid({ initial }: { initial: Snapshot }) {
  const { cameras, settings, connected } = useLiveData(initial);
  // Rings once per newly confirmed camera nobody has answered.
  useAlerting(cameras);
  const router = useRouter();
  const { position } = useOperator();

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [selected, setSelected] = useState(-1);
  const [showKeys, setShowKeys] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const camerasRef = useRef(cameras);
  camerasRef.current = cameras;

  const record = useCallback(
    async (index: number, verdict: Verdict) => {
      const camera = camerasRef.current[index];
      if (!camera?.detectionId) {
        setFlash("That camera has no detection to answer.");
        return;
      }
      const res = await fetch(`/api/detections/${camera.detectionId}/verdict`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verdict, by: position || null }),
      }).catch(() => null);
      setFlash(
        res && res.ok
          ? `${camera.name} marked. The stream will catch up on the next snapshot.`
          : `${camera.name} was not marked.`,
      );
    },
    [position],
  );

  /**
   * A watch floor runs on a keyboard. During an incident the mouse is the slow
   * path, and the operator's other hand is on a radio.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      // Never steal a keystroke from a field somebody is typing into.
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const list = camerasRef.current;
      const key = e.key.toLowerCase();

      if (key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((i) => Math.min(list.length - 1, i + 1));
      } else if (key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((i) => Math.max(0, i <= 0 ? 0 : i - 1));
      } else if (e.key === "Enter") {
        setSelected((i) => {
          if (i >= 0 && list[i]) router.push(`/camera/${list[i].id}`);
          return i;
        });
      } else if (e.key === "Escape") {
        setSelected(-1);
        setShowKeys(false);
      } else if (e.key === "?") {
        setShowKeys((v) => !v);
      } else if (KEY_TO_VERDICT[key]) {
        setSelected((i) => {
          if (i >= 0) void record(i, KEY_TO_VERDICT[key]);
          return i;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [record, router]);

  // Keep the selection on screen without yanking the page around.
  useEffect(() => {
    if (selected < 0) return;
    const camera = camerasRef.current[selected];
    if (!camera) return;
    document
      .getElementById(`tile-${camera.id}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  // Opening the list should not leave it below the fold.
  useEffect(() => {
    if (!showKeys) return;
    document.querySelector(".keys")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [showKeys]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  async function fireTestAlert() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/alerts/test", { method: "POST" });
      const body = await res.json();
      if (!res.ok) setTestResult(body.error ?? "The test alert did not fire.");
      else if (body.delivered) setTestResult("Test alert delivered to the webhook.");
      else setTestResult(body.reason ?? "Test alert recorded. No webhook is configured.");
    } catch {
      setTestResult("The test alert did not fire. The web app could not be reached.");
    } finally {
      setTesting(false);
    }
  }

  if (cameras.length === 0) {
    return (
      <main className="page">
        <div className="empty">
          <h2>No cameras yet</h2>
          <p>
            The worker registers its cameras when it starts. Add one to{" "}
            <code>ingestion/camera_config.yaml</code> and restart the stack.
          </p>
          <p className="muted">
            Every camera needs an id, a name, coordinates, and a source. The replay
            source needs only a folder of frames.
          </p>
        </div>
      </main>
    );
  }

  const counts = COUNTED.map((state) => ({
    state,
    value: cameras.filter((c) => c.state === state).length,
  })).filter((c) => c.value > 0 || c.state === "clear");

  const unanswered = cameras.filter((c) => c.state === "confirmed" && isOpen(c.detectionVerdict)).length;

  return (
    <main className="page">
      <AlertBanner cameras={cameras} />

      <div className="page-head">
        <h1 className="display-md" style={{ margin: 0 }}>
          Cameras
        </h1>
        <span className={`conn data-sm${connected ? " live" : ""}`}>
          <span className="conn-dot" />
          {connected ? "Live" : "Reconnecting"}
        </span>

        <div className="counts">
          {counts.map((c) => (
            <span className="count" data-state={c.state} key={c.state}>
              <span className="count-value">{c.value}</span>
              <span className="label">{COUNT_LABEL[c.state]}</span>
            </span>
          ))}
          {unanswered > 0 ? (
            <span className="count" data-state="confirmed">
              <span className="count-value">{unanswered}</span>
              <span className="label">unanswered</span>
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid">
        {cameras.map((camera, i) => (
          <CameraTile
            key={camera.id}
            camera={camera}
            settings={settings}
            selected={i === selected}
          />
        ))}
      </div>

      <div className="page-foot">
        <button className="btn" onClick={fireTestAlert} disabled={testing}>
          {testing ? "Firing test alert" : "Fire test alert"}
        </button>
        {testResult ? <span className="data-sm secondary">{testResult}</span> : null}
        <button className="btn ghost" onClick={() => setShowKeys((v) => !v)} aria-expanded={showKeys}>
          Keyboard <kbd>?</kbd>
        </button>
        <span className="data-sm muted" style={{ marginLeft: "auto" }}>
          Camera imagery from HPWREN, UC San Diego. CC BY-NC-ND 4.0.
        </span>
      </div>

      {showKeys ? (
        <div className="keys" role="region" aria-label="Keyboard shortcuts">
          <dl>
            {SHORTCUTS.map(([key, what]) => (
              <div key={key}>
                <dt>
                  <kbd>{key}</kbd>
                </dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {/* Announced rather than shown as a toast, so a verdict recorded by
          keyboard is confirmed to a screen reader as well as to the eye. */}
      <div className="flash" role="status" aria-live="polite">
        {flash ?? ""}
      </div>
    </main>
  );
}
