import { sql } from "./db";
import { cameraStateConfigured, settings } from "./decision";
import { STRIP_LENGTH, type RiskState, STATE_PRIORITY } from "./risk";

export type CameraRow = {
  id: string;
  name: string;
  network: string | null;
  site: string | null;
  lat: number | null;
  lng: number | null;
  elevationM: number | null;
  bearingDeg: number | null;
  sourceType: string;
  attribution: string | null;
  lastFrameAt: string | null;
  lastFramePath: string | null;
  lastFrameId: string | null;
  scores: number[];
  state: RiskState;
  consecutiveCount: number;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
  scorer: string | null;
  // The newest detection on this camera and what a human said about it. The
  // grid needs both: the model's claim decides the tile colour, the verdict
  // decides whether the alert is still asking for someone.
  detectionId: string | null;
  detectionStatus: string | null;
  detectionVerdict: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
};

/**
 * Every camera with the last STRIP_LENGTH frame scores attached.
 *
 * One query rather than one per camera. The lateral join is what makes that
 * possible, and at forty cameras the difference between one round trip and
 * forty is the difference between a dashboard that feels live and one that
 * does not.
 */
export async function listCameras(): Promise<CameraRow[]> {
  const rows = await sql`
    SELECT
      c.id, c.name, c.network, c.site, c.lat, c.lng,
      c.elevation_m, c.bearing_deg, c.source_type, c.attribution,
      f.captured_at  AS last_frame_at,
      f.storage_path AS last_frame_path,
      f.id           AS last_frame_id,
      COALESCE(s.scores, ARRAY[]::real[]) AS scores,
      d.id           AS det_id,
      d.confidence   AS det_confidence,
      d.bbox         AS det_bbox,
      d.scorer       AS det_scorer,
      d.status       AS det_status,
      d.verdict      AS det_verdict,
      d.resolved_at  AS det_resolved_at,
      d.resolved_by  AS det_resolved_by
    FROM cameras c
    LEFT JOIN LATERAL (
      SELECT id, captured_at, storage_path
      FROM frames WHERE camera_id = c.id
      ORDER BY captured_at DESC LIMIT 1
    ) f ON true
    LEFT JOIN LATERAL (
      SELECT array_agg(score ORDER BY captured_at DESC) AS scores
      FROM (
        SELECT score, captured_at FROM frames
        WHERE camera_id = c.id AND score IS NOT NULL
        ORDER BY captured_at DESC LIMIT ${STRIP_LENGTH}
      ) recent
    ) s ON true
    LEFT JOIN LATERAL (
      SELECT id, confidence, bbox, scorer, status, verdict, resolved_at, resolved_by
      FROM detections
      WHERE camera_id = c.id
      ORDER BY created_at DESC LIMIT 1
    ) d ON true
    ORDER BY c.id
  `;

  const now = new Date();
  const cameras = rows.map((r) => {
    const scores: number[] = (r.scores ?? []).map(Number);
    const { state, consecutiveCount } = cameraStateConfigured(scores, r.last_frame_at, now);
    return {
      id: r.id,
      name: r.name,
      network: r.network,
      site: r.site,
      lat: r.lat,
      lng: r.lng,
      elevationM: r.elevation_m,
      bearingDeg: r.bearing_deg,
      sourceType: r.source_type,
      attribution: r.attribution,
      lastFrameAt: r.last_frame_at ? new Date(r.last_frame_at).toISOString() : null,
      lastFramePath: r.last_frame_path,
      lastFrameId: r.last_frame_id,
      scores,
      state,
      consecutiveCount,
      confidence: scores.length ? scores[0] : 0,
      bbox: state === "confirmed" || state === "watching" ? (r.det_bbox ?? null) : null,
      scorer: r.det_scorer ?? null,
      detectionId: r.det_id ?? null,
      detectionStatus: r.det_status ?? null,
      detectionVerdict: r.det_verdict ?? null,
      resolvedAt: r.det_resolved_at ? new Date(r.det_resolved_at).toISOString() : null,
      resolvedBy: r.det_resolved_by ?? null,
    } as CameraRow;
  });

  // Anything needing attention sorts to the top, then by name so the grid does
  // not reshuffle under the operator's cursor on every refresh.
  return cameras.sort(
    (a, b) => STATE_PRIORITY[a.state] - STATE_PRIORITY[b.state] || a.name.localeCompare(b.name),
  );
}

export async function getCamera(id: string) {
  const [camera] = await sql`SELECT * FROM cameras WHERE id = ${id}`;
  if (!camera) return null;

  // The reference the scorer is comparing against, with the time it was
  // captured rather than the time it was recorded, because the operator wants
  // to know when the camera last looked like this.
  const [reference] = camera.reference_frame_path
    ? await sql`
        SELECT captured_at FROM frames
        WHERE storage_path = ${camera.reference_frame_path}
        ORDER BY captured_at DESC LIMIT 1
      `
    : [];

  const frames = await sql`
    SELECT id, captured_at, storage_path, score, label
    FROM frames WHERE camera_id = ${id}
    ORDER BY captured_at DESC LIMIT 60
  `;
  const detections = await sql`
    SELECT id, confidence, bbox, consecutive_count, status, verdict, scorer,
           created_at, frame_id, resolved_at, resolved_by, note
    FROM detections WHERE camera_id = ${id}
    ORDER BY created_at DESC LIMIT 30
  `;

  const scores = frames.filter((f) => f.score != null).map((f) => Number(f.score));
  const { state, consecutiveCount } = cameraStateConfigured(
    scores.slice(0, STRIP_LENGTH),
    frames[0]?.captured_at,
  );

  return {
    settings,
    camera: {
      id: camera.id,
      name: camera.name,
      network: camera.network,
      site: camera.site,
      lat: camera.lat,
      lng: camera.lng,
      elevationM: camera.elevation_m,
      bearingDeg: camera.bearing_deg,
      sourceType: camera.source_type,
      attribution: camera.attribution,
      referenceFramePath: camera.reference_frame_path ?? null,
      referenceCapturedAt: reference?.captured_at
        ? new Date(reference.captured_at).toISOString()
        : camera.reference_updated_at
          ? new Date(camera.reference_updated_at).toISOString()
          : null,
    },
    state,
    consecutiveCount,
    scores: scores.slice(0, STRIP_LENGTH),
    frames: frames.map((f) => ({
      id: f.id,
      capturedAt: new Date(f.captured_at).toISOString(),
      storagePath: f.storage_path,
      score: f.score == null ? null : Number(f.score),
      label: f.label,
    })),
    detections: detections.map((d) => ({
      id: d.id,
      confidence: Number(d.confidence),
      bbox: d.bbox,
      consecutiveCount: d.consecutive_count,
      status: d.status,
      verdict: d.verdict ?? null,
      scorer: d.scorer,
      createdAt: new Date(d.created_at).toISOString(),
      frameId: d.frame_id,
      resolvedAt: d.resolved_at ? new Date(d.resolved_at).toISOString() : null,
      resolvedBy: d.resolved_by ?? null,
      note: d.note ?? null,
    })),
  };
}

export async function listDetections(limit = 50) {
  const rows = await sql`
    SELECT d.id, d.camera_id, d.confidence, d.bbox, d.consecutive_count,
           d.status, d.verdict, d.scorer, d.created_at, d.frame_id,
           d.resolved_at, d.resolved_by, d.note,
           c.name AS camera_name, c.lat, c.lng,
           f.storage_path,
           (SELECT count(*)::int FROM alerts a WHERE a.detection_id = d.id) AS alert_count
    FROM detections d
    JOIN cameras c ON c.id = d.camera_id
    LEFT JOIN frames f ON f.id = d.frame_id
    ORDER BY d.created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((d) => ({
    id: d.id,
    cameraId: d.camera_id,
    cameraName: d.camera_name,
    lat: d.lat,
    lng: d.lng,
    confidence: Number(d.confidence),
    bbox: d.bbox,
    consecutiveCount: d.consecutive_count,
    status: d.status,
    verdict: d.verdict ?? null,
    scorer: d.scorer,
    createdAt: new Date(d.created_at).toISOString(),
    framePath: d.storage_path,
    alertCount: d.alert_count,
    resolvedAt: d.resolved_at ? new Date(d.resolved_at).toISOString() : null,
    resolvedBy: d.resolved_by ?? null,
    note: d.note ?? null,
  }));
}

export type HandoffRow = {
  detectionId: string;
  cameraId: string;
  cameraName: string;
  confidence: number;
  consecutiveCount: number;
  createdAt: string;
  framePath: string | null;
  verdict: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  note: string | null;
};

/**
 * What happened during a shift.
 *
 * One row per alert, not per confirmed frame. A run that holds for eight frames
 * writes eight detections and fires exactly one alert, and a handoff listing all
 * eight would report a single fire as eight events, which is the same
 * exaggeration the consecutive-frame rule exists to prevent.
 */
export async function listHandoff(hours: number): Promise<HandoffRow[]> {
  const span = Math.min(72, Math.max(1, Math.round(hours)));
  const rows = await sql`
    SELECT d.id, d.camera_id, d.confidence, d.consecutive_count, d.created_at,
           d.verdict, d.resolved_at, d.resolved_by, d.note,
           c.name AS camera_name, f.storage_path
    FROM detections d
    JOIN cameras c ON c.id = d.camera_id
    LEFT JOIN frames f ON f.id = d.frame_id
    WHERE d.created_at > now() - (${span} * interval '1 hour')
      AND EXISTS (SELECT 1 FROM alerts a WHERE a.detection_id = d.id)
    ORDER BY d.created_at DESC
    LIMIT 500
  `;
  return rows.map((d) => ({
    detectionId: d.id,
    cameraId: d.camera_id,
    cameraName: d.camera_name,
    confidence: Number(d.confidence),
    consecutiveCount: d.consecutive_count,
    createdAt: new Date(d.created_at).toISOString(),
    framePath: d.storage_path,
    verdict: d.verdict ?? null,
    resolvedAt: d.resolved_at ? new Date(d.resolved_at).toISOString() : null,
    resolvedBy: d.resolved_by ?? null,
    note: d.note ?? null,
  }));
}
