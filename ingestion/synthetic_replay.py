"""Offline fallback frames.

Only used when the FIgLib download fails, so that the system still starts and the
pipeline still has something to score with no network at all. These are not
presented as real data anywhere: the folder is stamped SYNTHETIC and the
interface labels any camera fed by it.

The scene is deliberately plain, a graded sky over a ridge with sensor noise, and
the plume grows from a point on the ridge with drift and turbulence. That is
enough to exercise change detection, desaturation, and growth, which are the
three things the scorer actually looks at.
"""

from __future__ import annotations

import os

import numpy as np
from PIL import Image

W, H = 1024, 683
PRE, POST = 10, 25  # frames before and after ignition


def _scene(rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    y = np.linspace(0, 1, H)[:, None]
    sky = np.stack(
        [
            0.30 + 0.42 * y[:, 0][:, None].repeat(W, 1),
            0.48 + 0.36 * y[:, 0][:, None].repeat(W, 1),
            0.82 - 0.06 * y[:, 0][:, None].repeat(W, 1),
        ],
        axis=2,
    )

    ridge_y = (
        0.60 * H
        + 26 * np.sin(np.linspace(0, 5.0, W) + 0.6)
        + 13 * np.sin(np.linspace(0, 13.0, W) + 2.1)
    )
    yy = np.arange(H)[:, None]
    terrain = yy > ridge_y[None, :]

    ground = np.stack(
        [
            np.full((H, W), 0.30) + 0.05 * rng.standard_normal((H, W)),
            np.full((H, W), 0.27) + 0.05 * rng.standard_normal((H, W)),
            np.full((H, W), 0.21) + 0.05 * rng.standard_normal((H, W)),
        ],
        axis=2,
    )
    base = np.where(terrain[..., None], ground, sky)
    return np.clip(base, 0, 1).astype(np.float32), ridge_y


def _plume(age: float, rng: np.random.Generator) -> np.ndarray:
    """Alpha mask for a plume that has been burning for `age` frames."""
    if age <= 0:
        return np.zeros((H, W), np.float32)

    ox, oy = int(W * 0.38), int(H * 0.60)
    grow = min(age / 18.0, 1.0)
    height = 40 + 300 * grow
    width = 18 + 95 * grow

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # Rises and leans downwind as it climbs.
    dy = oy - yy
    lean = 0.42 * np.clip(dy, 0, None)
    dx = xx - (ox + lean)
    spread = width * (0.35 + 0.9 * np.clip(dy / max(height, 1), 0, 1))

    mask = np.exp(-(dx**2) / (2 * np.maximum(spread, 1) ** 2))
    rise = np.clip(dy / max(height, 1), 0, 1)
    # Dense at the base, thinning out as it rises, and faded to nothing at the
    # top rather than cut off, so the plume does not end on a straight edge.
    mask *= (1.0 - rise) ** 0.6 * (rise > 0)
    mask *= dy > 0

    turb = rng.standard_normal((H // 8, W // 8)).astype(np.float32)
    turb = np.asarray(Image.fromarray(turb).resize((W, H), Image.BICUBIC))
    mask *= np.clip(1.0 + 0.45 * turb, 0.25, 1.8)

    return np.clip(mask * (0.30 + 0.55 * grow), 0, 0.93).astype(np.float32)


def generate(folder: str) -> None:
    os.makedirs(folder, exist_ok=True)
    rng = np.random.default_rng(7)
    base, _ = _scene(rng)

    for i in range(-PRE, POST):
        frame = base.copy()
        # Slow illumination drift, so the scorer's drift handling gets exercised.
        frame *= 1.0 + 0.0025 * (i + PRE)

        alpha = _plume(float(i), np.random.default_rng(1000 + i))[..., None]
        smoke = np.array([0.78, 0.78, 0.76], np.float32)
        frame = frame * (1 - alpha) + smoke * alpha

        frame += 0.012 * rng.standard_normal(frame.shape).astype(np.float32)
        img = Image.fromarray((np.clip(frame, 0, 1) * 255).astype(np.uint8))
        img.save(os.path.join(folder, f"{i * 60:+06d}.jpg"), quality=88)

    with open(os.path.join(folder, "SOURCE.txt"), "w") as fh:
        fh.write(
            "SYNTHETIC\n"
            "Generated locally because the HPWREN download was unavailable.\n"
            "Not real camera imagery. Do not present these frames as real data.\n"
        )


if __name__ == "__main__":
    generate(os.path.join(os.environ.get("REPLAY_DIR", "/replay"), "synthetic"))
