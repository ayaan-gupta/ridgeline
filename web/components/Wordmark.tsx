/**
 * The mark is a ridgeline with one plume breaking it.
 *
 * That is the entire product in nine points: the horizon these cameras watch,
 * and the vertical interruption that means something is burning. It is drawn in
 * the state-confirmed color for the plume alone, which is the same rule the rest
 * of the interface follows.
 */
export function Wordmark() {
  return (
    <span className="wordmark">
      <svg width="22" height="18" viewBox="0 0 22 18" fill="none" aria-hidden="true">
        <path
          d="M1 15.5 L6.5 8 L10.5 12 L15 5.5 L21 15.5"
          stroke="var(--text-primary)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d="M15 5.5 C15 3.5 13.6 3 13.6 1.6"
          stroke="var(--state-confirmed)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      Ridgeline
    </span>
  );
}
