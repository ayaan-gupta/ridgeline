-- The operator's verdict on a detection.
--
-- Until now a confirmation could be raised and never answered. That is the gap
-- that decides whether a monitoring tool survives its second month: an alert
-- nobody can close keeps shouting, the next one is trusted less, and by week
-- three the tab is muted. It also means the system never learns which of its
-- claims were right.
--
-- This is a new column rather than a new value in `status`. `status` already
-- carries the model's own reading, confirmed or pending, and writing a human
-- answer into it would erase the claim being answered. Keeping them apart is
-- the whole point: the pair is what lets someone ask later why a person and the
-- scorer disagreed.
ALTER TABLE detections ADD COLUMN IF NOT EXISTS verdict text;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
-- A position label, typed by whoever is on the desk. This is not authentication
-- and the interface says so where it is entered.
ALTER TABLE detections ADD COLUMN IF NOT EXISTS resolved_by text;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS note text;

CREATE INDEX IF NOT EXISTS detections_verdict_idx ON detections (verdict, created_at DESC);
