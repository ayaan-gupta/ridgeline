/** Shapes of the scored manifests that model/build_reel.py writes. */

export type ReelFrame = {
  i: number;
  file: string;
  t: number;
  score: number | null;
  run: number;
  state: "clear" | "watching" | "confirmed";
  bbox: { x: number; y: number; w: number; h: number } | null;
};

export type Reel = {
  sequence: string;
  camera: {
    id: string;
    name: string;
    site: string;
    network: string;
    attribution: string;
    lat: number;
    lng: number;
    elevation_m: number;
    bearing_deg: number;
  };
  roi: number[];
  plume: number[] | null;
  threshold: number;
  consecutive: number;
  window: number;
  background_frames: number;
  seconds_per_frame: number;
  confirmed_index: number | null;
  confirmed_at_seconds: number | null;
  frames: ReelFrame[];
};

export type SweepRow = {
  n: number;
  found: number;
  missed: number;
  sequences: number;
  false_alarms: number;
  false_alarms_per_camera_per_day: number;
  median_latency_seconds: number | null;
  per_sequence: { sequence: string; found: boolean; at_seconds: number | null }[];
};

export type Sweep = { threshold: number; window: number; results: SweepRow[] };
