"""Sweeps the consecutive-frame rule from N=1 to N=5 over the replay set.

PRD 16.6 claims the temporal-consistency rule matters more than model accuracy.
That is a claim with a number attached, and this produces the number: the same
scorer, the same frames, the same threshold, with only N changed.

What comes out is the trade the rule actually makes. Raising N suppresses false
alarms, and it also costs detection latency and can lose a marginal fire
outright. Both halves get reported, because a page that showed only the first
half would be advertising.

Run it with:  docker compose exec model python sweep_consecutive.py
"""

from __future__ import annotations

import glob
import json
import os

import yaml

from heuristic_fallback import DEFAULT_ROI, score_sequence
from validate_replay import load_rois, load_truth, offset, on_plume

REPLAY_DIR = os.environ.get("REPLAY_DIR", "/replay")
WINDOW = 5
BACKGROUND = 3
THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.6"))
SECONDS_PER_FRAME = 60


def scored_series(folder: str, roi):
    """Score every window once. N never changes the scores, only how they are read."""
    frames = sorted(glob.glob(os.path.join(REPLAY_DIR, folder, "*.jpg")), key=offset)
    background = frames[:BACKGROUND]
    out = []
    for i in range(WINDOW, len(frames) + 1):
        window = frames[i - WINDOW : i]
        s = score_sequence(window, background_paths=background, roi=roi)
        out.append((offset(window[-1]), s.smoke_probability, s.bbox))
    return out


def median(values: list[int]) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return round((ordered[mid - 1] + ordered[mid]) / 2)


def main() -> int:
    rois, truth = load_rois(), load_truth()
    folders = sorted(d for d in os.listdir(REPLAY_DIR) if os.path.isdir(os.path.join(REPLAY_DIR, d)))
    series = {f: scored_series(f, rois.get(f, DEFAULT_ROI)) for f in folders}

    results = []
    for n in range(1, 6):
        found, missed, latencies, false_runs, clear_frames = 0, 0, [], 0, 0
        per_sequence = []
        for folder in folders:
            region = truth.get(folder)
            run = neg_run = 0
            confirmed_at, confirmed_bbox = None, None
            for secs, score, bbox in series[folder]:
                above = score >= THRESHOLD
                run = run + 1 if above else 0
                if secs < 0:
                    clear_frames += 1
                    neg_run = neg_run + 1 if above else 0
                    if neg_run == n:
                        false_runs += 1
                elif confirmed_at is None and run >= n:
                    confirmed_at, confirmed_bbox = secs, bbox
            hit = confirmed_at is not None and on_plume(confirmed_bbox, region)
            if hit:
                found += 1
                latencies.append(confirmed_at)
            else:
                missed += 1
            per_sequence.append(
                {"sequence": folder, "found": hit, "at_seconds": confirmed_at if hit else None}
            )
        clear_minutes = max(clear_frames, 1) * (SECONDS_PER_FRAME / 60)
        results.append(
            {
                "n": n,
                "found": found,
                "missed": missed,
                "sequences": len(folders),
                "false_alarms": false_runs,
                # Normalised across every clear frame in the set, so the rate is
                # per camera per day rather than per sequence.
                "false_alarms_per_camera_per_day": round(false_runs * (1440 / clear_minutes), 2),
                # A true median. Indexing the upper middle of an even list is
                # the same mistake validate_replay.py already had corrected, and
                # here it read 899 where the real answer is 660.
                "median_latency_seconds": median(latencies),
                "per_sequence": per_sequence,
            }
        )

    print(json.dumps({"threshold": THRESHOLD, "window": WINDOW, "results": results}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
