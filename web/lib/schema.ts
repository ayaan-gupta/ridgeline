import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const cameras = pgTable("cameras", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  network: text("network"),
  site: text("site"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  elevationM: integer("elevation_m"),
  bearingDeg: integer("bearing_deg"),
  sourceType: text("source_type").notNull(),
  sourceConfig: jsonb("source_config"),
  attribution: text("attribution"),
  status: text("status").default("active"),
  // The known-clear frame the scorer is comparing this camera against.
  referenceFramePath: text("reference_frame_path"),
  referenceUpdatedAt: timestamp("reference_updated_at", { withTimezone: true }),
});

export const frames = pgTable(
  "frames",
  {
    id: text("id").primaryKey(),
    cameraId: text("camera_id").references(() => cameras.id),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    storagePath: text("storage_path").notNull(),
    // Score for this frame alone. The frame strip reads this column, and the
    // consecutive-frame rule counts runs of it, so it is stored per frame
    // rather than derived from detections.
    score: real("score"),
    label: text("label"),
  },
  (t) => [index("frames_camera_captured_idx").on(t.cameraId, t.capturedAt)],
);

export const detections = pgTable(
  "detections",
  {
    id: text("id").primaryKey(),
    cameraId: text("camera_id").references(() => cameras.id),
    frameId: text("frame_id").references(() => frames.id),
    confidence: real("confidence").notNull(),
    bbox: jsonb("bbox"),
    consecutiveCount: integer("consecutive_count").default(1),
    // The scorer's own reading: confirmed once the consecutive rule fired,
    // pending otherwise. Never written by a person.
    status: text("status").default("pending"),
    // The operator's answer, in its own column so it cannot overwrite the claim
    // it is answering. Null means nobody has looked yet.
    verdict: text("verdict"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
    note: text("note"),
    scorer: text("scorer"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("detections_created_idx").on(t.createdAt),
    index("detections_verdict_idx").on(t.verdict, t.createdAt),
  ],
);

export const alerts = pgTable("alerts", {
  id: text("id").primaryKey(),
  detectionId: text("detection_id").references(() => detections.id),
  channel: text("channel"),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow(),
  payload: jsonb("payload"),
  deliveryStatus: text("delivery_status").default("recorded"),
});

export type Camera = typeof cameras.$inferSelect;
export type Frame = typeof frames.$inferSelect;
export type Detection = typeof detections.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
