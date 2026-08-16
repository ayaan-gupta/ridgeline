import { RISK_LABEL, type RiskState } from "@/lib/risk";

/**
 * Risk state as a chip.
 *
 * The word is always present, not just the color. Red-green color vision
 * deficiency affects roughly one man in twelve, and this is a life-safety tool,
 * so no state is ever communicated by hue alone.
 */
export function StateChip({
  state,
  count,
  consecutive,
}: {
  state: RiskState;
  count?: number;
  consecutive?: number;
}) {
  return (
    <span className="chip" data-state={state}>
      {RISK_LABEL[state]}
      {state === "watching" && count ? ` ${count}/${consecutive ?? 3}` : ""}
    </span>
  );
}
