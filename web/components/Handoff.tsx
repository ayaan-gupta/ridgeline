"use client";

import Link from "next/link";
import { useState } from "react";

import type { HandoffRow } from "@/lib/queries";
import { VERDICT_LABEL, isOpen, type Verdict } from "@/lib/verdicts";

import { frameUrl } from "./CameraTile";
import { TimeAgo } from "./TimeAgo";
import { VerdictActions } from "./VerdictActions";

/**
 * What to tell the next shift.
 *
 * Unanswered alerts sort to the top and stay there regardless of age, because
 * the only thing that must not be lost at a handover is the alert nobody
 * looked at. Everything else is ordered by time.
 */
export function Handoff({
  rows,
  hours,
  windows,
}: {
  rows: HandoffRow[];
  hours: number;
  windows: number[];
}) {
  const open = rows.filter((r) => isOpen(r.verdict));
  const answered = rows.filter((r) => !isOpen(r.verdict));
  const counts = {
    real: rows.filter((r) => r.verdict === "real_fire").length,
    false: rows.filter((r) => r.verdict === "false_alarm").length,
    seen: rows.filter((r) => r.verdict === "acknowledged").length,
  };

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="display-md" style={{ margin: 0 }}>
          Handoff
        </h1>
        <nav className="handoff-windows">
          {windows.map((w) => (
            <Link key={w} href={`/handoff?hours=${w}`} aria-current={w === hours ? "page" : undefined}>
              {w}h
            </Link>
          ))}
        </nav>
      </div>

      <p className="data-sm secondary handoff-summary">
        {rows.length === 0
          ? `No alerts in the last ${hours} hours.`
          : `${rows.length} alert${rows.length === 1 ? "" : "s"} in the last ${hours} hours. ` +
            `${open.length} unanswered, ${counts.real} called a real fire, ` +
            `${counts.false} called a false alarm, ${counts.seen} seen and undecided.`}
      </p>

      {open.length > 0 ? (
        <section className="handoff-block">
          <div className="label handoff-label" data-open="true">
            Needs an answer
          </div>
          <ul className="handoff-list">
            {open.map((r) => (
              <Row key={r.detectionId} row={r} />
            ))}
          </ul>
        </section>
      ) : null}

      {answered.length > 0 ? (
        <section className="handoff-block">
          <div className="label handoff-label">Answered</div>
          <ul className="handoff-list">
            {answered.map((r) => (
              <Row key={r.detectionId} row={r} />
            ))}
          </ul>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <div className="empty">
          <h2>Nothing fired</h2>
          <p>
            No camera reached {"three consecutive frames"} in this window. That is the
            normal result for most shifts.
          </p>
        </div>
      ) : null}
    </main>
  );
}

function Row({ row }: { row: HandoffRow }) {
  const src = frameUrl(row.framePath);
  // The frame volume keeps the most recent frames per camera and prunes the
  // rest, so a handoff reaching back over a shift will point at files that are
  // no longer on disk. Saying so is better than a row of empty grey boxes that
  // read as a broken page.
  const [gone, setGone] = useState(false);
  return (
    <li className="handoff-row" data-open={isOpen(row.verdict) || undefined}>
      <Link className="handoff-thumb" href={`/camera/${row.cameraId}`} aria-hidden="true" tabIndex={-1}>
        {src && !gone ? (
          <img src={src} alt="" loading="lazy" onError={() => setGone(true)} />
        ) : (
          <span className="handoff-thumb-gone">frame pruned</span>
        )}
      </Link>

      <div className="handoff-main">
        <Link className="handoff-name" href={`/camera/${row.cameraId}`}>
          {row.cameraName}
        </Link>
        <div className="data-sm secondary">
          {row.cameraId}
          {"  confidence "}
          {row.confidence.toFixed(2)}
          {"  "}
          {row.consecutiveCount} consecutive frames
          {"  "}
          <TimeAgo iso={row.createdAt} />
        </div>
        {row.note ? <div className="data-sm muted handoff-note">{row.note}</div> : null}
      </div>

      <div className="handoff-answer">
        {isOpen(row.verdict) ? (
          <VerdictActions detectionId={row.detectionId} verdict={row.verdict} compact />
        ) : (
          <span className="verdict-done data-sm" data-verdict={row.verdict}>
            {VERDICT_LABEL[row.verdict as Verdict] ?? row.verdict}
            {row.resolvedBy ? ` by ${row.resolvedBy}` : ""}
          </span>
        )}
      </div>
    </li>
  );
}
