"""Checks that a confirmation is only scored as a find when it lands on the fire.

These cases are not hypothetical. An earlier version of validate_replay.py
counted any confirmation after the labeled ignition as a detection and therefore
reported five of five fires found. Two of those five were a cloud drifting beside
the sun and a lens vignette in the corner of a fisheye, on sequences that had no
visible plume in them at all.

The boxes below are the real ones from that run. They are kept as a test so the
same flattering arithmetic cannot come back.

Run it with:  docker compose exec model python test_validation.py
"""

from __future__ import annotations

import sys

from validate_replay import load_truth, on_plume

# name, box, sequence, expected
CASES = [
    # The two that used to be counted as successes.
    ("cloud beside the sun is not a plume", {"x": 0.9375, "y": 0.11, "w": 0.0625, "h": 0.11},
     "rm-n-20160604", False),
    ("lens vignette is not a plume", {"x": 0.0, "y": 0.42, "w": 0.0625, "h": 0.055},
     "junction-fire", False),

    # Real plumes must still be accepted, including the one that genuinely sits
    # on the frame edge. Cropping edges away to kill vignette artefacts would
    # lose this fire, which is why the region is tight vertically instead.
    ("junction plume at the frame edge", {"x": 0.0, "y": 0.28, "w": 0.0625, "h": 0.055},
     "junction-fire", True),
    ("rm-n plume", {"x": 0.9375, "y": 0.39, "w": 0.0625, "h": 0.11},
     "rm-n-20160604", True),
    ("beaver plume", {"x": 0.8125, "y": 0.50, "w": 0.0625, "h": 0.055},
     "beaver-fire", True),
    ("creelman plume", {"x": 0.625, "y": 0.50, "w": 0.0625, "h": 0.055},
     "creelman-fire", True),

    # A confirmation with no box cannot be shown to be on the fire.
    ("no box is not a find", None, "beaver-fire", False),
]


def main() -> int:
    truth = load_truth()
    if not truth:
        print("No plume regions loaded. Check replay_truth.yaml.")
        return 1

    failures = 0
    for name, box, sequence, expected in CASES:
        region = truth.get(sequence)
        if region is None:
            print(f"  fail  {name}: no region for {sequence}")
            failures += 1
            continue
        got = on_plume(box, region)
        if got is expected:
            print(f"  ok    {name}")
        else:
            print(f"  fail  {name}: got {got}, expected {expected}")
            failures += 1

    # Every sequence the system plays needs a verified region, or it silently
    # becomes unscorable and quietly drops out of the totals.
    print()
    if failures:
        print(f"{failures} of {len(CASES)} checks failed.")
        return 1
    print(f"{len(CASES)} checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
