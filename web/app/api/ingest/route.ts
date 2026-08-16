import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { fireAlert } from "@/lib/alerts";
import { db, sql } from "@/lib/db";
import { detections, frames } from "@/lib/schema";
import { classifyConfigured, CONFIDENCE_THRESHOLD, CONSECUTIVE_FRAMES } from "@/lib/decision";
import { STRIP_LENGTH } from "@/lib/risk";

export const dynamic = "force-dynamic";

/**
 * The ingestion worker posts one scored frame here.
 *
 * This route owns the decision rule. The worker captures and scores; whether a
 * score amounts to a detection is decided in one place, so the threshold and the
 * consecutive-frame count can be changed without redeploying the worker.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const cameraId = body?.camera_id;
  const framePath = body?.frame_path;
  const result = body?.inference_result;

  if (!cameraId || !framePath || !result) {
    return NextResponse.json(
      { error: "Expected camera_id, frame_path and inference_result." },
      { status: 400 },
    );
  }

  const [camera] = await sql`
    SELECT id, name, lat, lng, reference_frame_path FROM cameras WHERE id = ${cameraId}
  `;
  if (!camera) {
    return NextResponse.json({ error: `No camera with id ${cameraId}.` }, { status: 404 });
  }

  const score = Number(result.smoke_probability ?? 0);
  const capturedAt = body.captured_at ? new Date(body.captured_at) : new Date();
  const frameId = randomUUID();

  await db.insert(frames).values({
    id: frameId,
    cameraId,
    capturedAt,
    storagePath: framePath,
    score,
    label: body.frame_label ?? null,
  });

  // Newest first, which is the order the rule reads them in.
  // Record which frame the scorer used as its reference, so the dashboard can
  // show the operator the same comparison the model made. Only written when it
  // changes, which is rarely: the worker refreshes it after twelve consecutive
  // clear frames and freezes it as soon as anything crosses the line.
  const background: unknown = body?.background_frames;
  if (Array.isArray(background) && background.length > 0) {
    const newest = background[background.length - 1];
    if (typeof newest === "string" && newest !== camera.reference_frame_path) {
      await sql`
        UPDATE cameras
        SET reference_frame_path = ${newest}, reference_updated_at = now()
        WHERE id = ${cameraId}
      `;
    }
  }

  const recent = await sql`
    SELECT score FROM frames
    WHERE camera_id = ${cameraId} AND score IS NOT NULL
    ORDER BY captured_at DESC LIMIT ${STRIP_LENGTH}
  `;
  const scores = recent.map((r) => Number(r.score));
  const { state, consecutiveCount } = classifyConfigured(scores);

  let detectionId: string | null = null;
  let alerted = false;

  if (state !== "clear") {
    detectionId = randomUUID();
    await db.insert(detections).values({
      id: detectionId,
      cameraId,
      frameId,
      confidence: score,
      bbox: result.bbox ?? null,
      consecutiveCount,
      status: state === "confirmed" ? "confirmed" : "pending",
      scorer: result.scorer ?? null,
    });

    // Fire once, at the exact frame the run reaches the required length. Firing
    // on every confirmed frame afterwards would be the alert fatigue this whole
    // rule exists to prevent.
    if (state === "confirmed" && consecutiveCount === CONSECUTIVE_FRAMES) {
      await fireAlert(detectionId, {
        cameraId: camera.id,
        cameraName: camera.name,
        confidence: score,
        consecutiveCount,
        lat: camera.lat,
        lng: camera.lng,
        bbox: result.bbox ?? null,
        framePath,
        detectedAt: capturedAt.toISOString(),
        scorer: result.scorer ?? null,
      });
      alerted = true;
    }
  }

  return NextResponse.json({
    status: state,
    frame_id: frameId,
    detection_id: detectionId,
    consecutive_count: consecutiveCount,
    alerted,
    threshold: CONFIDENCE_THRESHOLD,
    required_consecutive: CONSECUTIVE_FRAMES,
  });
}
