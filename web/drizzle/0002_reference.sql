-- The reference frame each camera is being scored against.
--
-- The worker already holds a few known-clear frames and freezes them the moment
-- anything crosses the threshold, so a growing plume can never quietly become
-- the thing it is compared to. Those frames existed only inside the worker and
-- the model service, which meant the operator was asked to judge a plume without
-- being shown the one image that makes the judgment easy.
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS reference_frame_path text;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS reference_updated_at timestamptz;
