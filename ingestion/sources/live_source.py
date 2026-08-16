"""Polls a real public camera endpoint.

Off by default, and deliberately so. HPWREN imagery is published under
CC BY-NC-ND 4.0 (https://www.hpwren.ucsd.edu/cc.html): non-commercial use,
no derivatives, attribution required. These are also feeds meant for people to
look at, so the polling floor below is a courtesy as much as a setting.

Turn this on with ENABLE_LIVE_SOURCES=true only once you have read those terms
and your use fits them. When it is on, the interface shows the network's
attribution on every live frame.

URL patterns confirmed against hpwren.ucsd.edu/cameras on 2026-08-15:
  full size  https://cdn.hpwren.ucsd.edu/RT/{site}-{dir}-mobo-c.jpg
  640 px     https://cdn.hpwren.ucsd.edu/RTS/{site}-{dir}-mobo-c-640.jpg
Both need a cache-busting query string or a CDN copy comes back unchanged.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone

import httpx

from .base import CameraSource, Frame

log = logging.getLogger("ridgeline.ingestion.live")

# Never poll a public camera faster than this, whatever the config says.
MIN_POLL_SECONDS = 30.0


class LiveSource(CameraSource):
    def __init__(self, camera_id: str, config: dict):
        super().__init__(camera_id, config)
        self.url = config["url"]
        self.attribution = config.get("attribution", "")
        self._client = httpx.Client(
            timeout=20.0,
            follow_redirects=True,
            headers={"User-Agent": "Ridgeline/1.0 (wildfire smoke detection; non-commercial)"},
        )
        self._last_digest: bytes | None = None

    @property
    def poll_interval_seconds(self) -> float:
        return max(MIN_POLL_SECONDS, float(self.config.get("poll_interval_seconds", 60)))

    def fetch_latest_frame(self) -> Frame | None:
        url = f"{self.url}{'&' if '?' in self.url else '?'}t={int(time.time() * 1000)}"
        try:
            resp = self._client.get(url)
            resp.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            log.warning("%s: fetch failed: %s", self.camera_id, exc)
            return None

        image = resp.content
        if not image or len(image) < 2048:
            log.warning("%s: response was too small to be a frame", self.camera_id)
            return None

        # These cameras refresh on their own schedule, so a poll often returns
        # the frame we already have. Scoring a repeat would put a duplicate bar
        # in the strip and make the window look older than it is.
        digest = image[:512]
        if digest == self._last_digest:
            return None
        self._last_digest = digest

        return Frame(image=image, captured_at=datetime.now(timezone.utc))

    def describe(self) -> str:
        return f"live({self.camera_id}, {self.url})"
