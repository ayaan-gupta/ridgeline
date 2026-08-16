from .base import CameraSource, Frame
from .live_source import LiveSource
from .replay_source import ReplaySource

__all__ = ["CameraSource", "Frame", "ReplaySource", "LiveSource"]


def build_source(camera: dict) -> CameraSource:
    kind = camera.get("source_type", "replay")
    config = camera.get("source_config", {}) or {}
    if kind == "replay":
        return ReplaySource(camera["id"], config)
    if kind == "live":
        return LiveSource(camera["id"], config)
    raise ValueError(f"unknown source_type: {kind}")
