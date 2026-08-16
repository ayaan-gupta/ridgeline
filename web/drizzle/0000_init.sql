CREATE TABLE IF NOT EXISTS "cameras" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "network" text,
  "site" text,
  "lat" double precision,
  "lng" double precision,
  "elevation_m" integer,
  "bearing_deg" integer,
  "source_type" text NOT NULL,
  "source_config" jsonb,
  "attribution" text,
  "status" text DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS "frames" (
  "id" text PRIMARY KEY NOT NULL,
  "camera_id" text REFERENCES "cameras"("id"),
  "captured_at" timestamp with time zone NOT NULL,
  "storage_path" text NOT NULL,
  "score" real,
  "label" text
);

CREATE TABLE IF NOT EXISTS "detections" (
  "id" text PRIMARY KEY NOT NULL,
  "camera_id" text REFERENCES "cameras"("id"),
  "frame_id" text REFERENCES "frames"("id"),
  "confidence" real NOT NULL,
  "bbox" jsonb,
  "consecutive_count" integer DEFAULT 1,
  "status" text DEFAULT 'pending',
  "scorer" text,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "alerts" (
  "id" text PRIMARY KEY NOT NULL,
  "detection_id" text REFERENCES "detections"("id"),
  "channel" text,
  "sent_at" timestamp with time zone DEFAULT now(),
  "payload" jsonb,
  "delivery_status" text DEFAULT 'recorded'
);

CREATE INDEX IF NOT EXISTS "frames_camera_captured_idx" ON "frames" ("camera_id","captured_at");
CREATE INDEX IF NOT EXISTS "detections_created_idx" ON "detections" ("created_at");
