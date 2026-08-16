"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

import { RISK_LABEL, type RiskState } from "@/lib/risk";
import type { CameraRow } from "@/lib/queries";

// Same state colors as the grid. An operator moving between the two views should
// never have to re-learn what a color means.
//
// These are literals rather than var(--state-*) because Leaflet writes them
// straight onto SVG path attributes, where a CSS custom property does not
// resolve. They mirror the tokens in globals.css and must be changed together.
const STATE_COLOR: Record<RiskState, string> = {
  clear: "#646c78",
  watching: "#d98a1f",
  confirmed: "#f2555a",
  offline: "#5a6472",
};

// Confirmed cameras draw larger, so severity survives being printed in grayscale
// or seen by someone who cannot separate the hues.
const STATE_RADIUS: Record<RiskState, number> = {
  clear: 6,
  watching: 8,
  confirmed: 11,
  offline: 6,
};

// Every marker carries a light ring, whatever its state.
//
// On the grid a clear camera is still a whole tile with a photograph in it, so
// rendering "nothing is happening" as silence costs nothing. On a map the marker
// is the only evidence the camera exists, and a dot at the luminance of the
// basemap answers "where are my cameras" with nothing at all. Presence is
// carried by the ring, risk by the fill. That is the same division of labour the
// rest of the system uses: form and lightness for structure, saturation only for
// a claim about a fire.
const RING = "#9ba3ae";

// A clear camera must not compete with a burning one for attention, but it still
// has to be findable: an operator asking "where are my cameras" gets no answer
// from a dot the same luminance as the basemap. So clear stays hue-neutral, and
// earns its visibility through lightness rather than through color.
const STATE_FILL_OPACITY: Record<RiskState, number> = {
  clear: 0.85,
  watching: 0.95,
  confirmed: 0.95,
  offline: 0.6,
};

/**
 * Fits the view once the container actually has a size.
 *
 * The map is loaded through a dynamic import, so on first mount its container
 * can still be zero by zero. Leaflet measures at that moment, decides the whole
 * world fits, and stays there. Invalidating the size and fitting again once
 * layout has happened is what makes the map open on San Diego County instead of
 * on the Atlantic.
 */
function FitToCameras({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();
  useEffect(() => {
    const settle = () => {
      map.invalidateSize();
      // maxZoom keeps a single camera, or several close together, from opening
      // at street level where the surrounding terrain gives no context.
      // Tight padding. The camera spread is taller than it is wide and the panel
      // is the other way round, so every pixel of slack here is bought with a
      // whole extra screen of empty ocean.
      map.fitBounds(bounds, { padding: [16, 16], maxZoom: 11 });
    };
    settle();
    const timer = setTimeout(settle, 120);
    window.addEventListener("resize", settle);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", settle);
    };
  }, [map, bounds]);
  return null;
}

/** Moves the view when a camera is picked from the rail. */
function FlyTo({ camera }: { camera: CameraRow | null }) {
  const map = useMap();
  useEffect(() => {
    if (!camera) return;
    map.flyTo([camera.lat as number, camera.lng as number], Math.max(map.getZoom(), 12), {
      duration: 0.6,
    });
  }, [map, camera]);
  return null;
}

export function MapView({
  cameras,
  focusId,
  onSelect,
}: {
  cameras: CameraRow[];
  focusId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const lats = cameras.map((c) => c.lat as number);
  const lngs = cameras.map((c) => c.lng as number);
  const bounds = L.latLngBounds(
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
    // Just enough margin that a marker on the edge is not clipped. The earlier
    // 0.35 combined with the fitBounds padding to open the map two zoom levels
    // out, which left five cameras as five specks in an empty county.
  ).pad(0.02);

  return (
    <div className="map-wrap">
      <MapContainer
        bounds={bounds}
        scrollWheelZoom
        // Matches --surface-base so the map sits on the same ground as every
        // other panel. It was a shade darker, which read as a hole in the page.
        style={{ height: "100%", width: "100%", background: "#0e1013" }}
      >
        <FitToCameras bounds={bounds} />
        <FlyTo camera={cameras.find((c) => c.id === focusId) ?? null} />
        <TileLayer
          attribution='Tiles CARTO, data OpenStreetMap contributors'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {cameras.map((camera) => {
          const state = camera.state as RiskState;
          return (
            <CircleMarker
              key={camera.id}
              center={[camera.lat as number, camera.lng as number]}
              radius={STATE_RADIUS[state]}
              pathOptions={{
                color: RING,
                weight: state === "clear" || state === "offline" ? 1 : 2,
                opacity: state === "offline" ? 0.5 : 0.9,
                fillColor: STATE_COLOR[state],
                fillOpacity: STATE_FILL_OPACITY[state],
              }}
              eventHandlers={{ click: () => onSelect?.(camera.id) }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <span style={{ fontSize: 11 }}>
                  {camera.name}: {RISK_LABEL[state]}
                </span>
              </Tooltip>
              <Popup className="map-popup">
                <div style={{ minWidth: 190 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{camera.name}</div>
                  <div className="data-sm" style={{ color: "var(--text-secondary)", marginBottom: 8 }}>
                    {camera.id}
                    <br />
                    {(camera.lat as number).toFixed(4)}, {(camera.lng as number).toFixed(4)}
                    {camera.elevationM ? <> at {camera.elevationM} m</> : null}
                  </div>
                  <div className="chip" data-state={state}>
                    {RISK_LABEL[state]}
                  </div>{" "}
                  <span className="data-sm" style={{ color: "var(--text-secondary)" }}>
                    {camera.confidence.toFixed(2)}
                  </span>
                  <div style={{ marginTop: 8 }}>
                    <a href={`/camera/${camera.id}`} style={{ fontSize: 12, textDecoration: "underline" }}>
                      Open camera
                    </a>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
