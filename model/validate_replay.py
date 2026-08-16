"""Measures the scorer against the replay sequences.

Reports what PRD section 14 asks for and plain accuracy hides: how often a clear
sky is called smoke, and how quickly a real plume is caught.

Every sequence is a real fire with frames named by their offset in seconds from
the labeled ignition, so frames before zero are the negative set and frames after
are the positive set. The false alarm rate is expressed per camera per day, which
is the number that decides whether a dispatcher keeps the system switched on.

Run it with:  docker compose exec model python validate_replay.py
"""

from __future__ import annotations

import glob
import os
import sys

import yaml

from heuristic_fallback import DEFAULT_ROI, score_sequence as heuristic_score

SCORER = os.environ.get("SCORER", "heuristic").strip().lower()


def score_sequence(window, background_paths=None, roi=None):
    """Scores with whichever scorer is being measured.

    Both go through the same window, background and region of interest, because
    a comparison where the two scorers saw different inputs would not be one.
    """
    if SCORER != "trained":
        return heuristic_score(window, background_paths=background_paths, roi=roi)

    import torch

    from model import SmokeNet, prepare_sequence

    global _net, _seq_len
    if "_net" not in globals():
        checkpoint = os.environ.get("MODEL_CHECKPOINT", "/app/weights/smokenet.pt")
        ckpt = torch.load(checkpoint, map_location="cpu", weights_only=False)
        _net = SmokeNet(backbone=ckpt.get("backbone", "resnet18"))
        _net.load_state_dict(ckpt["state_dict"])
        _net.eval()
        _seq_len = ckpt.get("sequence_length", 5)

    frames = window[-_seq_len:]
    tensor = prepare_sequence(frames, roi=roi or DEFAULT_ROI)
    with torch.no_grad():
        logits, _ = _net(tensor.unsqueeze(0))
        prob = float(torch.sigmoid(logits)[0].item())

    class Result:
        smoke_probability = prob

    return Result()

REPLAY_DIR = os.environ.get("REPLAY_DIR", "/replay")
CONFIG = os.environ.get("CAMERA_CONFIG", "/app/camera_config.yaml")
TRUTH = os.environ.get("REPLAY_TRUTH", "/app/replay_truth.yaml")
WINDOW = 5
BACKGROUND = 3
THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.6"))
CONSECUTIVE = int(os.environ.get("CONSECUTIVE_FRAMES", "3"))
# FIgLib frames are one minute apart.
SECONDS_PER_FRAME = 60


def offset(path: str) -> int:
    return int(os.path.basename(path)[:-4])


def load_truth() -> dict[str, tuple]:
    """folder -> the region where a human confirmed the plume actually is.

    Scoring a confirmation by timing alone cannot tell a plume from a cloud that
    happened to move after ignition, so location is checked too.
    """
    if not os.path.exists(TRUTH):
        return {}
    data = yaml.safe_load(open(TRUTH)) or {}
    out = {}
    for folder, spec in (data.get("sequences") or {}).items():
        box = (spec or {}).get("plume")
        if box:
            out[folder] = tuple(box)
    return out


def on_plume(bbox, region) -> bool:
    """Is the centre of the confirmed box inside the verified plume region?"""
    if bbox is None or region is None:
        return False
    cx = bbox["x"] + bbox["w"] / 2
    cy = bbox["y"] + bbox["h"] / 2
    x0, y0, x1, y1 = region
    return x0 <= cx <= x1 and y0 <= cy <= y1


def load_rois() -> dict[str, tuple]:
    """folder -> roi, from the camera config, so validation matches production."""
    if not os.path.exists(CONFIG):
        return {}
    cameras = yaml.safe_load(open(CONFIG)).get("cameras", [])
    out = {}
    for c in cameras:
        folder = (c.get("source_config") or {}).get("folder")
        if folder and c.get("roi"):
            out[folder] = tuple(c["roi"])
    return out


def evaluate(folder: str, roi, region) -> dict | None:
    frames = sorted(glob.glob(os.path.join(REPLAY_DIR, folder, "*.jpg")), key=offset)
    if len(frames) < WINDOW + BACKGROUND:
        return None

    background = frames[:BACKGROUND]
    run = 0
    confirmed_at: int | None = None
    confirmed_bbox = None
    negatives = positives = 0
    false_runs = 0
    neg_run = 0

    for i in range(WINDOW, len(frames) + 1):
        window = frames[i - WINDOW : i]
        newest = window[-1]
        scored = score_sequence(window, background_paths=background, roi=roi)
        score = scored.smoke_probability
        above = score >= THRESHOLD
        run = run + 1 if above else 0

        if offset(newest) < 0:
            negatives += 1
            neg_run = neg_run + 1 if above else 0
            # A false alarm is a confirmed one, not a single frame over the line.
            if neg_run == CONSECUTIVE:
                false_runs += 1
        else:
            positives += 1
            if confirmed_at is None and run >= CONSECUTIVE:
                confirmed_at = offset(newest)
                confirmed_bbox = getattr(scored, "bbox", None)

    # Each frame is a minute of camera time, so the clear part of this sequence
    # is `negatives` minutes of it. Scale the false alarms up to a full day.
    clear_minutes = max(negatives, 1) * (SECONDS_PER_FRAME / 60)
    per_day = false_runs * (1440 / clear_minutes)

    return {
        "folder": folder,
        "frames": len(frames),
        "clear_windows": negatives,
        "smoke_windows": positives,
        "false_alarms": false_runs,
        "false_alarms_per_camera_per_day": round(per_day, 2),
        "confirmed_at_seconds": confirmed_at,
        # Reported so a human can check the box sits on a plume rather than on a
        # frame edge. "Confirmed after ignition" alone cannot tell those apart,
        # and a false positive that happens to land after t=0 would otherwise be
        # counted as a detection.
        "confirmed_bbox": confirmed_bbox,
        # The confirmation only counts as finding the fire if it landed on the
        # plume. A confirmation somewhere else in the sky is a false alarm that
        # happened to occur after ignition, which is a different thing entirely.
        "on_plume": on_plume(confirmed_bbox, region),
        "has_truth": region is not None,
    }


def main() -> int:
    rois = load_rois()
    truth = load_truth()
    folders = sorted(
        d for d in os.listdir(REPLAY_DIR) if os.path.isdir(os.path.join(REPLAY_DIR, d))
    )
    if not folders:
        print(f"No replay sequences in {REPLAY_DIR}.")
        return 1

    print(f"scorer {SCORER}  threshold {THRESHOLD}  consecutive {CONSECUTIVE}\n")
    header = (
        f"{'sequence':<22}{'clear':>7}{'smoke':>7}{'false':>7}{'per day':>9}"
        f"{'confirmed':>11}  verdict"
    )
    print(header)
    print("-" * len(header))

    total_false = 0
    total_clear = 0
    detections: list[int] = []
    missed: list[str] = []
    misplaced: list[str] = []
    unlocated: list[str] = []
    unscorable: list[str] = []

    for folder in folders:
        roi = rois.get(folder, DEFAULT_ROI)
        region = truth.get(folder)
        result = evaluate(folder, roi, region)
        if result is None:
            print(f"{folder:<22}{'too few frames':>41}")
            continue
        total_false += result["false_alarms"]
        total_clear += result["clear_windows"]
        detected = result["confirmed_at_seconds"]

        if not result["has_truth"]:
            verdict = "no verified plume, cannot score"
            unscorable.append(folder)
        elif detected is None:
            verdict = "missed"
            missed.append(folder)
        elif result["on_plume"]:
            verdict = "found, box on the plume"
            detections.append(detected)
        elif result["confirmed_bbox"] is None:
            # The scorer fired but cannot say where. That is not a find: nothing
            # here can be checked against the plume, and an operator would be
            # handed an alert with no place to look.
            verdict = "confirmed, but this scorer reports no box"
            unlocated.append(folder)
        else:
            box = result["confirmed_bbox"]
            verdict = f"confirmed off the plume at x{box['x']:.2f} y{box['y']:.2f}"
            # Counted on its own line rather than folded into the per-day rate.
            # That rate is normalised by clear-sky minutes, and this fired during
            # the smoke half of the sequence, so adding it there would be mixing
            # two different denominators.
            misplaced.append(folder)

        print(
            f"{folder:<22}{result['clear_windows']:>7}{result['smoke_windows']:>7}"
            f"{result['false_alarms']:>7}{result['false_alarms_per_camera_per_day']:>9}"
            f"{(f'{detected:+d}s' if detected is not None else 'never'):>11}"
            f"  {verdict}"
        )

    clear_minutes = max(total_clear, 1)
    print("\nAcross all sequences")
    print(f"  clear camera time observed   {clear_minutes} minutes")
    print(f"  confirmed false alarms       {total_false}")
    print(f"  false alarms per camera/day  {round(total_false * 1440 / clear_minutes, 2)}")
    scorable = len(detections) + len(missed) + len(misplaced) + len(unlocated)
    print(f"  fires found on the plume     {len(detections)} of {scorable}")
    if detections:
        detections.sort()
        mid = len(detections) // 2
        median = (
            detections[mid]
            if len(detections) % 2
            else (detections[mid - 1] + detections[mid]) / 2
        )
        print(f"  median detection latency     {median:+.0f}s from labeled ignition")
    if missed:
        print(f"  never confirmed              {', '.join(missed)}")
    if misplaced:
        print(f"  confirmed off the plume      {', '.join(misplaced)}")
    if unlocated:
        print(f"  confirmed without a box      {', '.join(unlocated)}")
    if unscorable:
        print(f"  not scorable                 {', '.join(unscorable)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
