import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "./db";
import { alerts } from "./schema";

export type AlertPayload = {
  cameraId: string;
  cameraName: string;
  confidence: number;
  consecutiveCount: number;
  lat: number | null;
  lng: number | null;
  bbox: unknown;
  framePath: string | null;
  detectedAt: string;
  scorer: string | null;
};

/**
 * Records the alert, then tries to deliver it.
 *
 * Recording first is deliberate. If the webhook is misconfigured or Slack is
 * down, the operator still sees that the system fired, and the delivery failure
 * is visible as its own fact rather than as silence.
 */
export async function fireAlert(detectionId: string, payload: AlertPayload) {
  const webhook = process.env.SLACK_WEBHOOK_URL?.trim();
  const id = randomUUID();
  const channel = webhook ? "webhook" : "recorded";

  await db.insert(alerts).values({
    id,
    detectionId,
    channel,
    payload,
    deliveryStatus: webhook ? "sending" : "recorded",
  });

  if (!webhook) return { id, delivered: false, reason: "No webhook configured." };

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(slackMessage(payload)),
      signal: AbortSignal.timeout(10_000),
    });
    const ok = res.ok;
    await db
      .update(alerts)
      .set({ deliveryStatus: ok ? "delivered" : `failed ${res.status}` })
      .where(eq(alerts.id, id));
    return { id, delivered: ok };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    await db.update(alerts).set({ deliveryStatus: `failed: ${reason}` }).where(eq(alerts.id, id));
    return { id, delivered: false, reason };
  }
}

function slackMessage(p: AlertPayload) {
  const coords = p.lat != null && p.lng != null ? `${p.lat.toFixed(3)}, ${p.lng.toFixed(3)}` : "unknown";
  return {
    text: `Smoke confirmed at ${p.cameraName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `Smoke confirmed at ${p.cameraName}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Camera*\n${p.cameraId}` },
          { type: "mrkdwn", text: `*Confidence*\n${p.confidence.toFixed(2)}` },
          { type: "mrkdwn", text: `*Consecutive frames*\n${p.consecutiveCount}` },
          { type: "mrkdwn", text: `*Location*\n${coords}` },
          { type: "mrkdwn", text: `*Detected*\n${p.detectedAt}` },
          { type: "mrkdwn", text: `*Scorer*\n${p.scorer ?? "unknown"}` },
        ],
      },
    ],
  };
}
