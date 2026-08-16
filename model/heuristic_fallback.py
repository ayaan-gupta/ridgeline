"""Frame-differencing smoke scorer.

This runs the whole pipeline before a trained checkpoint exists, and stays in
place afterwards as the documented fallback whenever the checkpoint is missing
or fails to load.

The idea is the one from PRD section 9: a single frame cannot separate smoke
from fog, so score a short sequence instead. Build a background from the oldest
frames in the window, then look for a region that is simultaneously

  1. changing against that background,
  2. losing saturation (smoke washes color out of the terrain behind it),
  3. growing across consecutive frames rather than flickering.

Scoring is tile based rather than pixel based. Tiles are cheap, they give a
bounding box for free, and a global illumination shift (a cloud crossing the
sun, which moves every tile at once) can be cancelled by subtracting the median
tile response before ranking.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Sequence

import numpy as np
from PIL import Image

# Analysis resolution. Small enough to score a 5 frame window in well under a
# second on a CPU, large enough that a plume a few hundred pixels across in the
# source frame still lands inside a tile.
ANALYSIS_W, ANALYSIS_H = 512, 384
TILES_X, TILES_Y = 16, 12

# Number of oldest frames in the window used to build the background.
BACKGROUND_FRAMES = 2

# Region of interest, normalized (x0, y0, x1, y1) on the source frame.
#
# This default is not cosmetic. Scoring the whole frame produced a strong,
# perfectly steady false positive along the bottom edge of real HPWREN frames,
# because the foreground ridge carries the camera tower's own shadow rotating
# through the day plus vegetation moving in wind, and both change far more than
# a distant plume does. The top strip is excluded for a related reason: these
# cameras burn a timestamp into the image, so those pixels change every frame by
# construction.
#
# The side margins are deliberately NOT cropped, and that is a tradeoff rather
# than an oversight. These are fisheye lenses whose dark vignette shifts slightly
# as exposure adapts, which is desaturated and changing and therefore looks like
# smoke, and a sequence with no fire in it at all was confirming on a strip of
# empty sky at the frame edge because of it. Trimming the sides removes that, and
# also removes the Junction Fire plume, which genuinely sits at the very left
# edge of that camera's view.
# Missing a real fire is the worse error, so the edges stay in and the artifact
# is documented instead. A camera with a persistent edge artifact should get its
# own roi in camera_config.yaml.
#
# Smoke that matters is near the horizon, so that is where we look. Any camera
# whose horizon sits elsewhere can override this in camera_config.yaml.
DEFAULT_ROI = (0.0, 0.06, 1.0, 0.72)

# Tiles at or above this mean luminance are treated as blown out and scored zero.
#
# A low sun sitting in frame is the single worst false positive these cameras
# produce. The sensor clips, the bloom around the disc changes shape every single
# frame as the sun moves, and that change is large, local, and desaturated, which
# is exactly the signature the scorer is built to find. Real smoke is never a
# clipped highlight: it is translucent, so it always carries some of the scene
# behind it. Excluding clipped tiles costs nothing real and removes an entire
# class of alarm.
OVEREXPOSED_LUMA = 0.97
# A tile is discarded once this fraction of its pixels are clipped. Testing on a
# mean would miss the tile that is half sun and half sky, which is precisely the
# tile the bloom moves through.
OVEREXPOSED_FRACTION = 0.02


@dataclass
class ScoreResult:
    smoke_probability: float
    bbox: dict | None
    per_frame_scores: list[float]
    scorer: str = "heuristic"
    detail: dict = field(default_factory=dict)


def _load(path: str, roi: tuple[float, float, float, float]) -> tuple[np.ndarray, np.ndarray]:
    """Return (gray, saturation) arrays at analysis resolution, float32 0-1."""
    with Image.open(path) as im:
        im = im.convert("RGB")
        w, h = im.size
        im = im.crop((int(w * roi[0]), int(h * roi[1]), int(w * roi[2]), int(h * roi[3])))
        im = im.resize((ANALYSIS_W, ANALYSIS_H), Image.BILINEAR)
        rgb = np.asarray(im, dtype=np.float32) / 255.0

    gray = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
    return gray, sat.astype(np.float32)


def _tiles(a: np.ndarray) -> np.ndarray:
    """Reduce a full-resolution array to a TILES_Y x TILES_X grid of means."""
    th, tw = ANALYSIS_H // TILES_Y, ANALYSIS_W // TILES_X
    return a[: th * TILES_Y, : tw * TILES_X].reshape(TILES_Y, th, TILES_X, tw).mean(axis=(1, 3))


def _blown_mask(gray: np.ndarray, bg_gray: np.ndarray) -> np.ndarray:
    """Tiles that are clipped now or were clipped in the background.

    The mask is grown by one tile in each direction, because the halo around a
    clipped sun is not itself clipped but moves just as much.
    """
    clipped_now = _tiles((gray >= OVEREXPOSED_LUMA).astype(np.float32))
    clipped_bg = _tiles((bg_gray >= OVEREXPOSED_LUMA).astype(np.float32))
    blown = (clipped_now > OVEREXPOSED_FRACTION) | (clipped_bg > OVEREXPOSED_FRACTION)
    grown = blown.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            grown |= np.roll(np.roll(blown, dy, axis=0), dx, axis=1)
    return grown


def _frame_response(
    gray: np.ndarray, sat: np.ndarray, bg_gray: np.ndarray, bg_sat: np.ndarray
) -> np.ndarray:
    """Per-tile smoke response for one frame against the background."""
    # How much the tile changed at all.
    change = _tiles(np.abs(gray - bg_gray))

    # Smoke veils the scene: saturation drops relative to background.
    desat = _tiles(np.clip(bg_sat - sat, 0.0, None))

    # Cancel whole-scene illumination shifts. A cloud crossing the sun lifts
    # every tile roughly equally, so the median lift carries no local
    # information and is removed before ranking.
    change = np.clip(change - np.median(change), 0.0, None)
    desat = np.clip(desat - np.median(desat), 0.0, None)

    # Both conditions have to hold, so combine multiplicatively rather than by
    # sum. A tile that only changed (a car, a bird, a shadow) or only
    # desaturated (haze settling) does not score.
    response = np.sqrt(change * 6.0) * np.sqrt(desat * 12.0 + 0.02)

    response[_blown_mask(gray, bg_gray)] = 0.0
    return response


def score_sequence(
    paths: Sequence[str],
    background_paths: Sequence[str] | None = None,
    roi: tuple[float, float, float, float] | None = None,
) -> ScoreResult:
    """Score an ordered sequence of frame paths, oldest first.

    If background_paths is given, the background is built from those frames
    instead of from the head of the window. This matters more than it looks: a
    plume that grows slowly will work its way into a window-local background and
    erase its own signal within a few minutes, so the score spikes once at
    ignition and then decays back to nothing. A background held from known-clear
    frames keeps a growing plume anomalous for as long as it is actually there,
    which is what the consecutive-frame rule needs in order to fire.
    """
    if len(paths) < 2:
        return ScoreResult(0.0, None, [0.0] * len(paths), detail={"reason": "sequence too short"})

    roi = roi or DEFAULT_ROI
    frames = [_load(p, roi) for p in paths]

    if background_paths:
        bg = [_load(p, roi) for p in background_paths]
        n_bg = len(bg)
        bg_gray = np.median(np.stack([g for g, _ in bg]), axis=0)
        bg_sat = np.median(np.stack([s for _, s in bg]), axis=0)
    else:
        n_bg = min(BACKGROUND_FRAMES, len(frames) - 1)
        bg_gray = np.median(np.stack([g for g, _ in frames[:n_bg]]), axis=0)
        bg_sat = np.median(np.stack([s for _, s in frames[:n_bg]]), axis=0)

    responses = [_frame_response(g, s, bg_gray, bg_sat) for g, s in frames]

    # Growth check. Smoke keeps building; glare and birds spike once and stop.
    # Weight each frame by how much its response exceeds the frame before it,
    # so a monotonically growing region outscores a single spike of equal peak.
    per_frame: list[float] = []
    growth = np.zeros_like(responses[0])
    for i, r in enumerate(responses):
        if i > 0:
            growth = np.clip(growth + (r - responses[i - 1]), 0.0, None) * 0.85 + r * 0.15
        combined = r * (0.55 + 0.45 * _norm(growth))
        per_frame.append(float(_squash(combined.max())))

    # The reported region is the strongest tile on the newest frame plus any
    # neighbour within 60% of it, which keeps a tall plume in one box.
    final = responses[-1] * (0.55 + 0.45 * _norm(growth))
    bbox = _bbox_from(final, roi)

    # The reported probability is the newest frame's score, not an average over
    # the window. The decision layer applies "N consecutive frames each above
    # threshold" (PRD 16.6), so it needs one honest number per captured frame.
    # Averaging across the window would smear a sharp three-frame plume below
    # threshold and smear a single glare spike above it, which is backwards on
    # both counts.
    prob = float(np.clip(per_frame[-1], 0.0, 1.0))

    return ScoreResult(
        smoke_probability=round(prob, 4),
        bbox=bbox,
        per_frame_scores=[round(p, 4) for p in per_frame],
        detail={
            "background_frames": n_bg,
            "background_source": "reference" if background_paths else "window",
            "roi": [round(v, 4) for v in roi],
            "peak_tile_response": round(float(final.max()), 4),
        },
    )


def _norm(a: np.ndarray) -> np.ndarray:
    m = float(a.max())
    return a / m if m > 1e-9 else a


def _squash(x: float) -> float:
    """Map a raw tile response onto 0-1 with a soft knee.

    The 0.42 midpoint was set so that a clean-sky sequence scores well under the
    0.6 default threshold while an established plume clears it, using the
    bundled replay sequences as the reference.
    """
    return 1.0 / (1.0 + math.exp(-(x - 0.42) * 9.0))


def _bbox_from(resp: np.ndarray, roi: tuple[float, float, float, float]) -> dict | None:
    """Bounding box in full-frame normalized coordinates, not ROI coordinates.

    The UI draws this box over the original image, so the ROI crop has to be
    undone here or every box would sit too high on the frame.
    """
    peak = float(resp.max())
    if peak <= 1e-6:
        return None
    ys, xs = np.where(resp >= peak * 0.6)
    if len(xs) == 0:
        return None
    x0, x1 = xs.min() / TILES_X, (xs.max() + 1) / TILES_X
    y0, y1 = ys.min() / TILES_Y, (ys.max() + 1) / TILES_Y

    rw, rh = roi[2] - roi[0], roi[3] - roi[1]
    x0, x1 = roi[0] + x0 * rw, roi[0] + x1 * rw
    y0, y1 = roi[1] + y0 * rh, roi[1] + y1 * rh
    return {
        "x": round(float(x0), 4),
        "y": round(float(y0), 4),
        "w": round(float(x1 - x0), 4),
        "h": round(float(y1 - y0), 4),
    }
