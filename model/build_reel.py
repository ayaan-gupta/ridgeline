"""Bakes a replay sequence into a scored manifest for the landing page reel.

The landing page scrubs through a real fire and shows the model's confidence
climbing frame by frame until the consecutive-frame rule fires. Those numbers
have to be the real ones. Inventing a curve that looks good would make the whole
page a mockup, which is the one thing the page is arguing against.

So this runs the identical loop the replay worker runs: same window length, same
frozen background, same region of interest from camera_config.yaml, same
threshold and same consecutive-frame count. The only difference is that it keeps
every intermediate score instead of only the verdict.

Run it with:  docker compose exec model python build_reel.py junction-fire
Output goes to stdout as JSON. The Makefile target writes it into web/public.
"""

from __future__ import annotations

import glob
import json
import os
import sys

import yaml

from heuristic_fallback import DEFAULT_ROI, score_sequence

REPLAY_DIR = os.environ.get("REPLAY_DIR", "/replay")
CONFIG = os.environ.get("CAMERA_CONFIG", "/app/camera_config.yaml")
TRUTH = os.environ.get("REPLAY_TRUTH", "/app/replay_truth.yaml")
WINDOW = 5
BACKGROUND = 3
THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.6"))
CONSECUTIVE = int(os.environ.get("CONSECUTIVE_FRAMES", "3"))


def offset(path: str) -> int:
    return int(os.path.basename(path)[:-4])


def camera_for(folder: str) -> dict:
    """The camera row whose replay folder this is, for name and coordinates."""
    if not os.path.exists(CONFIG):
        return {}
    for c in yaml.safe_load(open(CONFIG)).get("cameras", []):
        if (c.get("source_config") or {}).get("folder") == folder:
            return c
    return {}


def truth_for(folder: str):
    if not os.path.exists(TRUTH):
        return None
    data = yaml.safe_load(open(TRUTH)) or {}
    return ((data.get("sequences") or {}).get(folder) or {}).get("plume")


def build(folder: str) -> dict:
    frames = sorted(glob.glob(os.path.join(REPLAY_DIR, folder, "*.jpg")), key=offset)
    if len(frames) < WINDOW + BACKGROUND:
        raise SystemExit(f"{folder}: not enough frames to score")

    camera = camera_for(folder)
    roi = tuple(camera["roi"]) if camera.get("roi") else DEFAULT_ROI
    background = frames[:BACKGROUND]

    steps = []
    run = 0
    confirmed_index = None

    for idx, path in enumerate(frames):
        secs = offset(path)
        entry = {
            "i": idx,
            "file": os.path.basename(path),
            "t": secs,
            "score": None,
            "run": 0,
            "state": "clear",
            "bbox": None,
        }

        # The first frames exist but cannot be scored: the window is not full
        # yet. The reel shows them as real imagery with no reading, which is
        # also what an operator sees when a camera has just come online.
        if idx + 1 >= WINDOW:
            window = frames[idx + 1 - WINDOW : idx + 1]
            scored = score_sequence(window, background_paths=background, roi=roi)
            score = scored.smoke_probability
            run = run + 1 if score >= THRESHOLD else 0
            state = "clear"
            if run >= CONSECUTIVE:
                state = "confirmed"
            elif score >= THRESHOLD:
                state = "watching"
            entry.update(
                {
                    "score": score,
                    "run": run,
                    "state": state,
                    "bbox": scored.bbox if score >= THRESHOLD else None,
                }
            )
            if confirmed_index is None and run >= CONSECUTIVE:
                confirmed_index = idx

        steps.append(entry)

    return {
        "sequence": folder,
        "camera": {
            "id": camera.get("id"),
            "name": camera.get("name"),
            "site": camera.get("site"),
            "network": camera.get("network"),
            "attribution": camera.get("attribution"),
            "lat": camera.get("lat"),
            "lng": camera.get("lng"),
            "elevation_m": camera.get("elevation_m"),
            "bearing_deg": camera.get("bearing_deg"),
        },
        "roi": [round(v, 4) for v in roi],
        "plume": truth_for(folder),
        "threshold": THRESHOLD,
        "consecutive": CONSECUTIVE,
        "window": WINDOW,
        "background_frames": BACKGROUND,
        "seconds_per_frame": 60,
        "confirmed_index": confirmed_index,
        "confirmed_at_seconds": steps[confirmed_index]["t"] if confirmed_index is not None else None,
        "frames": steps,
    }


if __name__ == "__main__":
    folder = sys.argv[1] if len(sys.argv) > 1 else "junction-fire"
    print(json.dumps(build(folder), indent=1))
