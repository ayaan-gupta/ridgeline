"""Downloads FIgLib sequences for training.

Separate from the replay fetch on purpose. The replay data is five sequences and
about 20 MB, and it ships automatically because the system needs input to run.
Training data is tens of sequences and hundreds of megabytes, so it is opt in.

HPWREN imagery is CC BY-NC-ND 4.0. Read https://www.hpwren.ucsd.edu/cc.html
before using any of it beyond local research.
"""

from __future__ import annotations

import argparse
import io
import os
import re
import urllib.parse
import urllib.request

from PIL import Image

BASE = "https://cdn.hpwren.ucsd.edu/HPWREN-FIgLib-Data/"
STORE_WIDTH = 640
TIMEOUT = 60


def list_sequences() -> list[str]:
    with urllib.request.urlopen(BASE + "index.html", timeout=TIMEOUT) as fh:
        index = fh.read().decode("utf8", "ignore")
    return sorted(set(re.findall(r"href=([0-9]{8}_[^/\s>]+)/index\.html", index)))


def list_frames(sequence: str) -> list[str]:
    with urllib.request.urlopen(BASE + sequence + "/index.html", timeout=TIMEOUT) as fh:
        index = fh.read().decode("utf8", "ignore")
    raw = re.findall(r"href=([0-9]+_(?:%2B|\+|-)[0-9]+\.jpg)", index, re.I)
    names = sorted({urllib.parse.unquote(r) for r in raw}, key=lambda n: int(n.split("_")[1][:-4]))
    return names


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=os.environ.get("FIGLIB_DIR", "/data/figlib"))
    parser.add_argument("--sequences", type=int, default=40)
    parser.add_argument("--window", type=int, default=1500, help="Seconds either side of ignition.")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    sequences = list_sequences()
    print(f"{len(sequences)} sequences available, taking {args.sequences}")

    # Even stride through the catalogue rather than the first N, so the training
    # set spans years, seasons and cameras instead of one cluster of old fires.
    stride = max(1, len(sequences) // args.sequences)
    chosen = sequences[::stride][: args.sequences]

    for n, sequence in enumerate(chosen, 1):
        folder = os.path.join(args.out, sequence)
        os.makedirs(folder, exist_ok=True)
        if len([f for f in os.listdir(folder) if f.endswith(".jpg")]) >= 10:
            print(f"[{n}/{len(chosen)}] {sequence}: already present")
            continue
        try:
            names = [
                x for x in list_frames(sequence) if abs(int(x.split("_")[1][:-4])) <= args.window
            ]
            for name in names:
                offset = int(name.split("_")[1][:-4])
                dst = os.path.join(folder, f"{offset:+06d}.jpg")
                if os.path.exists(dst):
                    continue
                with urllib.request.urlopen(
                    BASE + sequence + "/" + urllib.parse.quote(name), timeout=TIMEOUT
                ) as fh:
                    data = fh.read()
                image = Image.open(io.BytesIO(data)).convert("RGB")
                if image.width > STORE_WIDTH:
                    image = image.resize(
                        (STORE_WIDTH, round(image.height * STORE_WIDTH / image.width)),
                        Image.LANCZOS,
                    )
                image.save(dst, quality=85)
            print(f"[{n}/{len(chosen)}] {sequence}: {len(names)} frames")
        except Exception as exc:  # noqa: BLE001
            print(f"[{n}/{len(chosen)}] {sequence}: failed ({exc})")

    print(f"\nTraining data in {args.out}")
    print("HPWREN imagery, CC BY-NC-ND 4.0. https://www.hpwren.ucsd.edu/cc.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
