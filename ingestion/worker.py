"""Ingestion worker.

One thread per camera. Each loop pulls the next frame, writes it to the shared
frame volume, keeps a rolling window, asks the model service to score that
window, and posts the result to the web app, which owns the decision rule.

The worker holds three pieces of per-camera state that matter:

  window      the last WINDOW_SIZE frames, which is what gets scored
  background  a few known-clear frames used as the comparison reference
  alerted     frames that raised an alert, held back from pruning as evidence

The background is the subtle one. Scoring a window against its own first frames
works for a sudden change and fails for a growing plume, because within a few
minutes the plume is in the background and has erased its own signal. Holding a
reference from frames captured while the camera was Clear fixes that. The
reference is refreshed only while the camera stays Clear, and freezes the moment
anything crosses the threshold, so a real plume can never quietly become the
thing we compare against.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timezone

import httpx
import yaml

from sources import build_source

log = logging.getLogger("ridgeline.ingestion")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

MODEL_URL = os.environ.get("MODEL_SERVICE_URL", "http://model:8000")
WEB_URL = os.environ.get("WEB_BASE_URL", "http://web:3000")
FRAMES_DIR = os.environ.get("FRAMES_DIR", "/frames")
CONFIG_PATH = os.environ.get("CAMERA_CONFIG", "/app/camera_config.yaml")
ENABLE_LIVE = os.environ.get("ENABLE_LIVE_SOURCES", "false").lower() in {"1", "true", "yes"}

WINDOW_SIZE = 5
BACKGROUND_SIZE = 3
# Frames to keep on disk per camera. The dashboard shows recent history, not an
# archive, and the frame volume should not grow without bound during a long run.
RETAIN_FRAMES = 150
# Frames that produced an alert are kept beyond the retention window.
#
# Without this the handoff view is mostly empty boxes: it reaches back over a
# whole shift, and at one frame every few seconds the rolling window is about
# ten minutes deep. An alert whose frame has been deleted is a record of
# something having happened with the evidence thrown away.
#
# Capped so a long replay loop cannot fill the volume. In production alerts are
# rare, so this is effectively unbounded there and only bites on demo data.
RETAIN_ALERT_FRAMES = 300
# Refresh the background only after this many consecutive clear frames.
BACKGROUND_REFRESH_AFTER_CLEAR = 12

_threshold = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.6"))


class CameraRunner(threading.Thread):
    def __init__(self, camera: dict):
        super().__init__(daemon=True, name=f"camera-{camera['id']}")
        self.camera = camera
        self.source = build_source(camera)
        self.roi = camera.get("roi")
        self.dir = os.path.join(FRAMES_DIR, camera["id"])
        os.makedirs(self.dir, exist_ok=True)
        self.window: list[str] = []
        self.background: list[str] = []
        self.alerted: list[str] = []
        self.clear_streak = 0
        self.client = httpx.Client(timeout=60.0)

    def run(self) -> None:
        log.info("starting %s", self.source.describe())
        # Stagger startup so five cameras do not all hit the model service on
        # the same tick and queue behind each other.
        time.sleep(float(self.camera.get("start_delay_seconds", 0)))
        while True:
            try:
                self.tick()
            except Exception:  # noqa: BLE001
                log.exception("%s: tick failed", self.camera["id"])
            time.sleep(self.source.poll_interval_seconds)

    def tick(self) -> None:
        frame = self.source.fetch_latest_frame()
        if frame is None:
            return

        if frame.sequence_restarted:
            # A replay folder wrapping around is a scene change. Drop everything
            # so we never score the last frame of a fire against the first frame
            # of clean sky.
            log.info("%s: sequence restarted, clearing window and background", self.camera["id"])
            self.window.clear()
            self.background.clear()
            self.clear_streak = 0

        path = os.path.join(self.dir, f"{int(frame.captured_at.timestamp() * 1000)}.jpg")
        with open(path, "wb") as fh:
            fh.write(frame.image)

        self.window.append(path)
        self.window = self.window[-WINDOW_SIZE:]

        if len(self.background) < BACKGROUND_SIZE:
            self.background.append(path)

        if len(self.window) < 2:
            return

        result = self.score(self.window)
        if result is None:
            return

        probability = float(result.get("smoke_probability", 0.0))
        self.post_to_web(path, frame, result)
        self.update_background(probability, path)
        self.prune()

    def score(self, window: list[str]) -> dict | None:
        payload = {
            "camera_id": self.camera["id"],
            "frames": window,
            "background_frames": self.background or None,
        }
        if self.roi:
            payload["roi"] = self.roi
        try:
            resp = self.client.post(f"{MODEL_URL}/infer", json=payload)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:  # noqa: BLE001
            log.warning("%s: model service did not answer: %s", self.camera["id"], exc)
            return None

    def post_to_web(self, path: str, frame, result: dict) -> None:
        try:
            resp = self.client.post(
                f"{WEB_URL}/api/ingest",
                json={
                    "camera_id": self.camera["id"],
                    "frame_path": path,
                    "captured_at": frame.captured_at.astimezone(timezone.utc).isoformat(),
                    "frame_label": frame.label,
                    "inference_result": result,
                    # The reference the scorer compared against. Sent so the
                    # dashboard can put it next to the current frame, because
                    # "does this differ from what this camera normally looks
                    # like" is the judgment the operator is actually making, and
                    # until now only the model could see both halves of it.
                    "background_frames": list(self.background),
                },
            )
            resp.raise_for_status()
            body = resp.json()
            if body.get("alerted"):
                self.alerted = (self.alerted + [path])[-RETAIN_ALERT_FRAMES:]
            if body.get("status") == "confirmed":
                log.info(
                    "%s: CONFIRMED at %.3f after %s consecutive frames",
                    self.camera["id"],
                    result.get("smoke_probability", 0),
                    body.get("consecutive_count"),
                )
        except Exception as exc:  # noqa: BLE001
            log.warning("%s: web app did not accept the frame: %s", self.camera["id"], exc)

    def update_background(self, probability: float, path: str) -> None:
        if probability >= _threshold:
            self.clear_streak = 0
            return
        self.clear_streak += 1
        if self.clear_streak >= BACKGROUND_REFRESH_AFTER_CLEAR:
            # Roll one frame in, one out. Slow refresh tracks the sun moving and
            # the haze changing without ever swallowing a plume whole.
            self.background = (self.background + [path])[-BACKGROUND_SIZE:]
            self.clear_streak = 0

    def prune(self) -> None:
        keep = set(self.window) | set(self.background) | set(self.alerted)
        names = sorted(os.listdir(self.dir))
        if len(names) <= RETAIN_FRAMES:
            return
        for name in names[: len(names) - RETAIN_FRAMES]:
            full = os.path.join(self.dir, name)
            if full not in keep:
                try:
                    os.remove(full)
                except OSError:
                    pass


def load_cameras() -> list[dict]:
    with open(CONFIG_PATH) as fh:
        cameras = yaml.safe_load(fh).get("cameras", [])
    if not ENABLE_LIVE:
        skipped = [c["id"] for c in cameras if c.get("source_type") == "live"]
        cameras = [c for c in cameras if c.get("source_type") != "live"]
        if skipped:
            log.info(
                "Live cameras are off, skipping %s. Set ENABLE_LIVE_SOURCES=true to poll them, "
                "after reading https://www.hpwren.ucsd.edu/cc.html",
                ", ".join(skipped),
            )
    return cameras


def register(cameras: list[dict]) -> None:
    """Tell the web app which cameras exist. The worker owns that list."""
    payload = [
        {
            "id": c["id"],
            "name": c["name"],
            "network": c.get("network"),
            "lat": c.get("lat"),
            "lng": c.get("lng"),
            "elevation_m": c.get("elevation_m"),
            "bearing_deg": c.get("bearing_deg"),
            "source_type": c.get("source_type", "replay"),
            "source_config": c.get("source_config", {}),
            "attribution": c.get("attribution"),
        }
        for c in cameras
    ]
    for attempt in range(40):
        try:
            resp = httpx.post(f"{WEB_URL}/api/cameras", json={"cameras": payload}, timeout=20.0)
            resp.raise_for_status()
            log.info("registered %d cameras", len(payload))
            return
        except Exception as exc:  # noqa: BLE001
            log.info("waiting for the web app (%s/40): %s", attempt + 1, exc)
            time.sleep(3)
    raise SystemExit("web app never became reachable, giving up")


def wait_for_model() -> None:
    for attempt in range(60):
        try:
            resp = httpx.get(f"{MODEL_URL}/health", timeout=10.0)
            if resp.status_code == 200:
                log.info("model service ready, scoring with the %s scorer", resp.json().get("scorer"))
                return
        except Exception:  # noqa: BLE001
            pass
        log.info("waiting for the model service (%s/60)", attempt + 1)
        time.sleep(3)
    raise SystemExit("model service never became reachable, giving up")


def main() -> None:
    os.makedirs(FRAMES_DIR, exist_ok=True)
    cameras = load_cameras()
    if not cameras:
        log.error("No cameras configured. Add one to camera_config.yaml and restart.")
        return

    wait_for_model()
    register(cameras)

    runners = [CameraRunner(c) for c in cameras]
    for r in runners:
        r.start()
    log.info("watching %d cameras", len(runners))

    while True:
        time.sleep(30)
        alive = sum(1 for r in runners if r.is_alive())
        if alive < len(runners):
            log.error("%d of %d camera loops stopped", len(runners) - alive, len(runners))


if __name__ == "__main__":
    main()
