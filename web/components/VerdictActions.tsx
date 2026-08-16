"use client";

import { useState } from "react";

import { useOperator } from "@/lib/useOperator";
import { VERDICT_LABEL, type Verdict } from "@/lib/verdicts";

const CHOICES: { verdict: Verdict; label: string; key: string }[] = [
  { verdict: "real_fire", label: "Real fire", key: "R" },
  { verdict: "false_alarm", label: "False alarm", key: "F" },
  { verdict: "acknowledged", label: "Seen, undecided", key: "A" },
];

/**
 * The three answers an operator can give a detection.
 *
 * Ordered by how urgent the consequence is rather than by how likely the answer
 * is, so the hand goes to the same place every time. "Seen, undecided" is last
 * because it is the one that leaves the detection open.
 */
export function VerdictActions({
  detectionId,
  verdict,
  onResolved,
  compact = false,
}: {
  detectionId: string;
  verdict: string | null;
  onResolved?: (verdict: Verdict) => void;
  compact?: boolean;
}) {
  const { position } = useOperator();
  const [busy, setBusy] = useState<Verdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(verdict);

  async function record(choice: Verdict) {
    setBusy(choice);
    setError(null);
    try {
      const res = await fetch(`/api/detections/${detectionId}/verdict`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verdict: choice, by: position || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "That verdict was not recorded.");
        return;
      }
      setLocal(choice);
      onResolved?.(choice);
    } catch {
      setError("That verdict was not recorded. The web app could not be reached.");
    } finally {
      setBusy(null);
    }
  }

  if (local) {
    return (
      <span className="verdict-done data-sm" data-verdict={local}>
        {VERDICT_LABEL[local as Verdict] ?? local}
      </span>
    );
  }

  return (
    <div className={"verdicts" + (compact ? " compact" : "")}>
      {CHOICES.map((c) => (
        <button
          key={c.verdict}
          type="button"
          className="btn ghost verdict-btn"
          data-verdict={c.verdict}
          disabled={busy !== null}
          onClick={() => record(c.verdict)}
        >
          {busy === c.verdict ? "Recording" : c.label}
          <kbd>{c.key}</kbd>
        </button>
      ))}
      {error ? <span className="data-sm secondary">{error}</span> : null}
    </div>
  );
}
