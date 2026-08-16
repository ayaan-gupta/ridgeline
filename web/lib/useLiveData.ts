"use client";

import { useEffect, useRef, useState } from "react";

import type { CameraRow } from "./queries";

export type DetectionRow = {
  id: string;
  cameraId: string;
  cameraName: string;
  lat: number | null;
  lng: number | null;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
  consecutiveCount: number;
  status: string;
  verdict: string | null;
  scorer: string | null;
  createdAt: string;
  framePath: string | null;
  alertCount: number;
  resolvedAt: string | null;
  resolvedBy: string | null;
  note: string | null;
};

export type Settings = { threshold: number; consecutive: number };
export type Snapshot = {
  cameras: CameraRow[];
  detections: DetectionRow[];
  settings: Settings;
};

/**
 * Subscribes to the server-sent snapshot feed.
 *
 * Starts from data the server already rendered, so the first paint is real
 * rather than a spinner, then takes over from the stream. If the connection
 * drops the browser reconnects on its own; `connected` drives the indicator in
 * the top bar so a stalled dashboard is never mistaken for a quiet one.
 */
export function useLiveData(initial: Snapshot) {
  const [data, setData] = useState<Snapshot>(initial);
  const [connected, setConnected] = useState(false);
  const source = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    source.current = es;

    es.addEventListener("snapshot", (event) => {
      setConnected(true);
      try {
        const parsed = JSON.parse((event as MessageEvent).data);
        setData({
          cameras: parsed.cameras,
          detections: parsed.detections,
          settings: parsed.settings ?? initial.settings,
        });
      } catch {
        /* a malformed frame is not worth tearing the stream down over */
      }
    });
    es.addEventListener("keepalive", () => setConnected(true));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      source.current = null;
    };
  }, []);

  return { ...data, connected };
}
