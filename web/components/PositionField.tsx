"use client";

import { useOperator } from "@/lib/useOperator";

/**
 * Sits in the top bar so the label is set once at the start of a shift rather
 * than asked for in the middle of an alert.
 */
export function PositionField() {
  const { position, setPosition } = useOperator();
  return (
    <label className="position">
      <span className="label">Position</span>
      <input
        className="position-input data-sm"
        value={position}
        onChange={(e) => setPosition(e.target.value)}
        placeholder="unsigned"
        aria-label="Position label recorded with your verdicts. This is a label, not a sign in."
        title="Recorded alongside anything you mark. It is a label, not a sign in."
        maxLength={64}
        spellCheck={false}
      />
    </label>
  );
}
