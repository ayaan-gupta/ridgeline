/**
 * The verdicts an operator can record against a detection.
 *
 * These live in their own column, next to the `status` the scorer wrote. A
 * verdict answers a claim, it does not replace it, and a detection a person
 * called a false alarm still records the confidence and the consecutive count
 * that produced it.
 *
 * Three states rather than a boolean. "Acknowledged" exists because the honest
 * answer thirty seconds after an alert is usually "I have seen it and I do not
 * know yet", and a tool that forces a premature real-or-not choice will be
 * given a wrong one.
 */
export const VERDICTS = ["acknowledged", "real_fire", "false_alarm"] as const;

export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABEL: Record<Verdict, string> = {
  acknowledged: "Seen, undecided",
  real_fire: "Real fire",
  false_alarm: "False alarm",
};

export function isVerdict(value: unknown): value is Verdict {
  return typeof value === "string" && (VERDICTS as readonly string[]).includes(value);
}

/** A detection nobody has answered yet. */
export function isOpen(verdict: string | null | undefined): boolean {
  return !isVerdict(verdict);
}
