"""Fetches the replay frames.

Runs automatically when the ingestion container starts and the replay folders are
empty, so `docker compose up` needs no manual step. Already-downloaded sequences
are left alone, so restarts are instant.

Source is HPWREN's Fire Ignition Library, the dataset named in PRD section 8.
Each sequence is one real fire seen from one real camera, with frames named by
their offset in seconds from the labeled ignition, roughly one frame a minute for
forty minutes either side. We keep a window around ignition so every replay opens
on clean sky and then shows smoke arrive.

Frames are downloaded, not committed. HPWREN imagery is CC BY-NC-ND 4.0, and
fetching at runtime keeps this repository free of redistributed imagery while
still giving the demo real data.

If the network is unreachable, a synthetic sequence is generated instead so the
pipeline still has input and the system still comes up. The synthetic frames are
clearly labeled as synthetic everywhere they appear.
"""

from __future__ import annotations

import io
import os
import re
import sys
import urllib.parse
import urllib.request

from PIL import Image

BASE = "https://cdn.hpwren.ucsd.edu/HPWREN-FIgLib-Data/"
REPLAY_DIR = os.environ.get("REPLAY_DIR", "/replay")

# folder -> FIgLib sequence. Window is seconds relative to labeled ignition.
SEQUENCES = {
    "junction-fire": ("20260629_JunctionFire_hp-e-mobo-c", -900, 1200),
    "creelman-fire": ("20260722_CreelmanFire_cp-w-mobo-c", -900, 1200),
    "beaver-fire": ("20260807_BeaverFire_lp-w-mobo-c", -900, 1200),
    # Named by camera and date, because FIgLib labels these two only as "FIRE"
    # and inventing a fire name for them would be inventing a fact.
    "rm-n-20160604": ("20160604_FIRE_rm-n-mobo-c", -900, 1200),
    "smer-tcs8-20190829": ("20190829_FIRE_smer-tcs8-mobo-c", -900, 1200),
}

# Frames are stored at this width. Big enough that a distant plume survives, far
# smaller than the 3072px originals, which keeps the volume and the scoring cheap.
STORE_WIDTH = 1024
TIMEOUT = 45


def offset_of(name: str) -> int:
    return int(os.path.splitext(name)[0].split("_")[1])


def list_frames(sequence: str) -> list[str]:
    with urllib.request.urlopen(BASE + sequence + "/index.html", timeout=TIMEOUT) as fh:
        index = fh.read().decode("utf8", "ignore")
    raw = re.findall(r"href=([0-9]+_(?:%2B|\+|-)[0-9]+\.jpg)", index, re.I)
    return sorted({urllib.parse.unquote(r) for r in raw}, key=offset_of)


def fetch_sequence(folder: str, sequence: str, lo: int, hi: int) -> int:
    out = os.path.join(REPLAY_DIR, folder)
    os.makedirs(out, exist_ok=True)

    existing = [n for n in os.listdir(out) if n.endswith(".jpg")]
    if len(existing) >= 8:
        print(f"  {folder}: {len(existing)} frames already present, skipping")
        return len(existing)

    names = [n for n in list_frames(sequence) if lo <= offset_of(n) <= hi]
    print(f"  {folder}: fetching {len(names)} frames from {sequence}")

    written = 0
    for name in names:
        dst = os.path.join(out, f"{offset_of(name):+06d}.jpg")
        if os.path.exists(dst):
            written += 1
            continue
        url = BASE + sequence + "/" + urllib.parse.quote(name)
        with urllib.request.urlopen(url, timeout=TIMEOUT) as fh:
            data = fh.read()
        image = Image.open(io.BytesIO(data)).convert("RGB")
        if image.width > STORE_WIDTH:
            image = image.resize(
                (STORE_WIDTH, round(image.height * STORE_WIDTH / image.width)), Image.LANCZOS
            )
        image.save(dst, quality=88)
        written += 1

    with open(os.path.join(out, "SOURCE.txt"), "w") as fh:
        fh.write(
            f"{sequence}\n"
            f"HPWREN Fire Ignition Library, {BASE}{sequence}/\n"
            "UC San Diego HPWREN. Licensed CC BY-NC-ND 4.0.\n"
            "Filenames are seconds relative to the labeled ignition time.\n"
        )
    return written


def main() -> int:
    os.makedirs(REPLAY_DIR, exist_ok=True)
    print(f"Replay data in {REPLAY_DIR}")

    failures = []
    for folder, (sequence, lo, hi) in SEQUENCES.items():
        try:
            fetch_sequence(folder, sequence, lo, hi)
        except Exception as exc:  # noqa: BLE001
            print(f"  {folder}: could not fetch ({exc})")
            failures.append(folder)

    if failures:
        print(f"\n{len(failures)} sequence(s) unavailable. Generating synthetic frames for them")
        from synthetic_replay import generate

        for folder in failures:
            generate(os.path.join(REPLAY_DIR, folder))

    print("Replay data ready")
    return 0


if __name__ == "__main__":
    sys.exit(main())
