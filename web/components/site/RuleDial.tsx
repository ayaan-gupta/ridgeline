"use client";

import { useState } from "react";

import type { Sweep } from "./types";

const LABELS: Record<string, string> = {
  "junction-fire": "Junction Fire",
  "creelman-fire": "Creelman Fire",
  "beaver-fire": "Beaver Fire",
  "rm-n-20160604": "Red Mountain North",
  "smer-tcs8-20190829": "Santa Margarita TCS8",
};

/**
 * The consecutive-frame rule, as a dial over real measurements.
 *
 * model/sweep_consecutive.py scores every replay window once and then reads
 * those same scores back at N of one through five. So dragging this changes
 * exactly one thing, which is the only honest way to show what a parameter
 * costs.
 *
 * The result is not the flattering one. On this set the rule buys no reduction
 * in false alarms, because there were none to reduce at any N. What it costs is
 * visible immediately, and what it protects against is stated in words below
 * rather than implied by a number that is not there.
 */
export function RuleDial({ sweep }: { sweep: Sweep }) {
  const [n, setN] = useState(3);
  const row = sweep.results.find((r) => r.n === n) ?? sweep.results[0];
  const shipped = n === 3;

  return (
    <div className="dial">
      <div className="dial-control">
        <label className="micro" htmlFor="dial-n">
          consecutive frames required
        </label>
        <div className="dial-row">
          <input
            id="dial-n"
            type="range"
            min={1}
            max={5}
            step={1}
            value={n}
            onChange={(e) => setN(Number(e.target.value))}
            aria-describedby="dial-summary"
          />
          <output className="dial-n" htmlFor="dial-n">
            {n}
          </output>
        </div>
        <div className="dial-ticks" aria-hidden="true">
          {sweep.results.map((r) => (
            <button
              key={r.n}
              type="button"
              className="dial-tick"
              data-on={r.n === n || undefined}
              data-shipped={r.n === 3 || undefined}
              onClick={() => setN(r.n)}
              tabIndex={-1}
            >
              {r.n}
            </button>
          ))}
        </div>
        <p className="dial-note micro dim">
          {shipped
            ? "Three is what ships. It is the largest value that still catches every fire in this set."
            : n < 3
              ? "Faster, and every alert now rests on fewer agreeing frames."
              : "Slower, and two of the five fires never stay above the line long enough to reach it."}
        </p>
      </div>

      <ul className="dial-list">
        {row.per_sequence.map((s) => (
          <li key={s.sequence} className="dial-item" data-found={s.found || undefined}>
            <span className="dial-item-mark" aria-hidden="true" />
            <span className="dial-item-name">{LABELS[s.sequence] ?? s.sequence}</span>
            <span className="dial-item-value data">
              {s.found ? "+" + Math.round((s.at_seconds ?? 0) / 60) + " min" : "never"}
            </span>
          </li>
        ))}
      </ul>

      <dl className="dial-stats" id="dial-summary">
        <div>
          <dt className="micro">found</dt>
          <dd className="dial-stat">
            {row.found}
            <span className="dial-stat-of"> of {row.sequences}</span>
          </dd>
        </div>
        <div>
          <dt className="micro">median latency</dt>
          <dd className="dial-stat">
            {row.median_latency_seconds === null
              ? "n/a"
              : Math.round(row.median_latency_seconds / 60)}
            <span className="dial-stat-of"> min</span>
          </dd>
        </div>
        <div>
          <dt className="micro">false alarms per camera day</dt>
          <dd className="dial-stat">{row.false_alarms_per_camera_per_day.toFixed(1)}</dd>
        </div>
      </dl>
    </div>
  );
}
