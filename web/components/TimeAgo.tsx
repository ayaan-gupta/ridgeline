"use client";

import { useEffect, useState } from "react";

function format(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Relative time that ticks.
 *
 * Rendered empty on the server and filled in on the client, because the server
 * and the browser will never agree on "now" and a hydration mismatch on every
 * tile is not worth the millisecond it would save.
 */
export function TimeAgo({ iso }: { iso: string | null }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!iso) return <span className="data-sm muted">no frames yet</span>;
  return (
    <time className="data-sm muted" dateTime={iso} suppressHydrationWarning>
      {now == null ? " " : format(iso, now)}
    </time>
  );
}
