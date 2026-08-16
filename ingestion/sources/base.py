"""Camera source interface.

A source's only job is to hand back the next frame as bytes plus the time it was
captured. Everything downstream (buffering, scoring, the decision rule, alerting)
is identical whether the frame came off a live camera or out of a replay folder,
which is what makes the replay path a genuine test of the system rather than a
mock of it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass
class Frame:
    image: bytes
    captured_at: datetime
    # True when the source just wrapped back to the start of a loop. The worker
    # clears that camera's buffer and background reference when it sees this,
    # because the jump from the end of a sequence back to its beginning is a
    # scene change, not a scene event, and scoring across it would invent a
    # detection that never happened.
    sequence_restarted: bool = False
    label: str | None = None


class CameraSource:
    """Base class. Subclasses implement fetch_latest_frame."""

    def __init__(self, camera_id: str, config: dict):
        self.camera_id = camera_id
        self.config = config

    @property
    def poll_interval_seconds(self) -> float:
        return float(self.config.get("poll_interval_seconds", 60))

    def fetch_latest_frame(self) -> Frame | None:
        raise NotImplementedError

    def describe(self) -> str:
        return f"{type(self).__name__}({self.camera_id})"
