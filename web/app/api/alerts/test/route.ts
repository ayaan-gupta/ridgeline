import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { fireAlert } from "@/lib/alerts";
import { db, sql } from "@/lib/db";
import { detections } from "@/lib/schema";

export const dynamic = "force-dynamic";

/**
 * Fires a test alert down the real alert path so it can be checked on demand.
 *
 * It attaches to the most recent real detection when there is one, so what gets
 * delivered is a true-to-life message rather than a placeholder. With no
 * detections yet it still fires, using the first camera, and says plainly that
 * it is a test.
 */
export async function POST() {
  const [detection] = await sql`
    SELECT d.id, d.confidence, d.consecutive_count, d.bbox, d.scorer, d.created_at,
           c.id AS camera_id, c.name AS camera_name, c.lat, c.lng,
           f.storage_path
    FROM detections d
    JOIN cameras c ON c.id = d.camera_id
    LEFT JOIN frames f ON f.id = d.frame_id
    ORDER BY d.created_at DESC LIMIT 1
  `;

  if (detection) {
    const outcome = await fireAlert(detection.id, {
      cameraId: detection.camera_id,
      cameraName: `${detection.camera_name} (test)`,
      confidence: Number(detection.confidence),
      consecutiveCount: detection.consecutive_count,
      lat: detection.lat,
      lng: detection.lng,
      bbox: detection.bbox,
      framePath: detection.storage_path,
      detectedAt: new Date(detection.created_at).toISOString(),
      scorer: detection.scorer,
    });
    return NextResponse.json({ ...outcome, basedOn: detection.id, test: true });
  }

  const [camera] = await sql`SELECT id, name, lat, lng FROM cameras ORDER BY id LIMIT 1`;
  if (!camera) {
    return NextResponse.json(
      { error: "No cameras are configured yet, so there is nothing to alert about." },
      { status: 409 },
    );
  }

  const placeholder = randomUUID();
  await db.insert(detections).values({
    id: placeholder,
    cameraId: camera.id,
    confidence: 0,
    consecutiveCount: 0,
    status: "dismissed",
    scorer: "test",
  });
  const outcome = await fireAlert(placeholder, {
    cameraId: camera.id,
    cameraName: `${camera.name} (test)`,
    confidence: 0,
    consecutiveCount: 0,
    lat: camera.lat,
    lng: camera.lng,
    bbox: null,
    framePath: null,
    detectedAt: new Date().toISOString(),
    scorer: "test",
  });
  return NextResponse.json({ ...outcome, test: true, note: "No detections yet." });
}
