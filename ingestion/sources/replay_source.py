"""Replays a local folder of frames in order, on a loop.

This is the default and guaranteed path. The demo never depends on a live camera
network being reachable, on daylight, or on a fire happening to be burning during
a presentation. The frames themselves are real: they come from HPWREN's Fire
Ignition Library, which is exactly this task's data, so replaying them exercises
the same detector against the same imagery a live feed would deliver.

Frames are named by their offset in seconds from the labeled ignition time, for
example -00123.jpg or +00237.jpg, which is FIgLib's own convention. Sorting is
numeric on that offset, so a folder always plays clean sky first and smoke after.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

from .base import CameraSource, Frame


def _offset(name: str) -> int:
    stem = os.path.splitext(name)[0]
    try:
        return int(stem)
    except ValueError:
        return 0


class ReplaySource(CameraSource):
    def __init__(self, camera_id: str, config: dict):
        super().__init__(camera_id, config)
        base = os.environ.get("REPLAY_DIR", "/replay")
        self.folder = os.path.join(base, config["folder"])
        self.index = int(config.get("start_offset_frames", 0))
        self._names: list[str] = []
        self._loaded = False

    def _names_list(self) -> list[str]:
        if not self._loaded:
            if os.path.isdir(self.folder):
                self._names = sorted(
                    (n for n in os.listdir(self.folder) if n.lower().endswith((".jpg", ".jpeg", ".png"))),
                    key=_offset,
                )
            self._loaded = True
        return self._names

    def fetch_latest_frame(self) -> Frame | None:
        names = self._names_list()
        if not names:
            return None

        restarted = self.index >= len(names)
        if restarted:
            self.index = 0

        name = names[self.index]
        self.index += 1

        with open(os.path.join(self.folder, name), "rb") as fh:
            image = fh.read()

        return Frame(
            image=image,
            captured_at=datetime.now(timezone.utc),
            sequence_restarted=restarted,
            label=os.path.splitext(name)[0],
        )

    def describe(self) -> str:
        return f"replay({self.camera_id}, {len(self._names_list())} frames from {self.folder})"
