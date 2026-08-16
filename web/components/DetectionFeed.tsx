"use client";

import Link from "next/link";

import { useLiveData, type Snapshot } from "@/lib/useLiveData";
import { VERDICT_LABEL, type Verdict } from "@/lib/verdicts";

import { frameUrl } from "./CameraTile";
import { TimeAgo } from "./TimeAgo";

export function DetectionFeed({ initial }: { initial: Snapshot }) {
  const { detections, connected } = useLiveData(initial);

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="display-md" style={{ margin: 0 }}>
          Detections
        </h1>
        <span className={`conn data-sm${connected ? " live" : ""}`}>
          <span className="conn-dot" />
          {connected ? "Live" : "Reconnecting"}
        </span>
      </div>

      {detections.length === 0 ? (
        <div className="empty">
          <h2>Nothing detected yet</h2>
          <p>
            Detections appear here the moment a frame scores at or above the
            threshold. Confirmed ones fired an alert.
          </p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Frame</th>
                <th>Camera</th>
                <th>State</th>
                <th>Confidence</th>
                <th>Consecutive</th>
                <th>Scorer</th>
                <th>Alerts</th>
                <th>Verdict</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {detections.map((d) => {
                const src = frameUrl(d.framePath);
                return (
                  <tr key={d.id}>
                    <td style={{ width: 76 }}>
                      {src ? (
                        <img
                          src={src}
                          alt=""
                          style={{
                            width: 68,
                            aspectRatio: "3 / 2",
                            objectFit: "cover",
                            display: "block",
                            borderRadius: 2,
                          }}
                        />
                      ) : (
                        <span className="data-sm muted">gone</span>
                      )}
                    </td>
                    <td>
                      <Link href={`/camera/${d.cameraId}`}>{d.cameraName}</Link>
                      <div className="data-sm muted">{d.cameraId}</div>
                    </td>
                    <td>
                      <span
                        className="chip"
                        data-state={d.status === "confirmed" ? "confirmed" : "watching"}
                      >
                        {d.status === "confirmed" ? "Confirmed" : "Watching"}
                      </span>
                    </td>
                    <td className="data">{d.confidence.toFixed(3)}</td>
                    <td className="data">{d.consecutiveCount}</td>
                    <td className="data-sm secondary">{d.scorer ?? "unknown"}</td>
                    {/* The operator's answer next to the model's claim, which
                        is the pair that makes this table worth keeping. */}
                    <td className="data-sm">
                      {d.verdict ? (
                        <span className="verdict-done" data-verdict={d.verdict}>
                          {VERDICT_LABEL[d.verdict as Verdict] ?? d.verdict}
                          {d.resolvedBy ? ` by ${d.resolvedBy}` : ""}
                        </span>
                      ) : (
                        <span className="muted">Unanswered</span>
                      )}
                    </td>
                    <td>
                      <TimeAgo iso={d.createdAt} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
