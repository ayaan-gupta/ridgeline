"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { RISK_LABEL, type RiskState } from "@/lib/risk";
import { useLiveData, type Snapshot } from "@/lib/useLiveData";

// Leaflet reaches for window at import time, so it never runs on the server.
const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => (
    <div className="map-wrap" style={{ display: "grid", placeItems: "center" }}>
      <span className="data-sm muted">Loading the map</span>
    </div>
  ),
});

export function MapPanel({ initial }: { initial: Snapshot }) {
  const { cameras, connected } = useLiveData(initial);
  const [focusId, setFocusId] = useState<string | null>(null);
  const placed = cameras.filter((c) => c.lat != null && c.lng != null);

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="display-md" style={{ margin: 0 }}>
          Map
        </h1>
        <span className={`conn data-sm${connected ? " live" : ""}`}>
          <span className="conn-dot" />
          {connected ? "Live" : "Reconnecting"}
        </span>
        <span className="data-sm muted" style={{ marginLeft: "auto" }}>
          {placed.length} of {cameras.length} cameras have coordinates
        </span>
      </div>

      {placed.length === 0 ? (
        <div className="empty">
          <h2>No cameras to place</h2>
          <p>
            Cameras appear here once they have a latitude and longitude. Add them
            in <code>ingestion/camera_config.yaml</code>.
          </p>
        </div>
      ) : (
        /* A rail beside the map rather than a map alone. These cameras span
           more latitude than longitude and the panel is the other way round, so
           a full width map spends half its area on ocean. The rail takes that
           space back and answers the question the map is bad at: which camera
           is which, and which one needs me. */
        <div className="map-layout">
          <ul className="map-rail">
            {placed.map((c) => {
              const state = c.state as RiskState;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className="map-rail-item"
                    data-state={state}
                    data-on={c.id === focusId || undefined}
                    onClick={() => setFocusId(c.id)}
                  >
                    <span className="map-rail-name">{c.name}</span>
                    <span className="map-rail-meta data-sm">
                      {c.id}
                      {"  "}
                      {c.confidence.toFixed(2)}
                    </span>
                    <span className="map-rail-state label">{RISK_LABEL[state]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <MapView cameras={placed} focusId={focusId} onSelect={setFocusId} />
        </div>
      )}
    </main>
  );
}
