"""FIgLib loader with a per-camera split.

The split is by camera, never by frame. PRD section 9 is emphatic about this and
it is worth restating why: every frame from one camera shares a background. Split
by frame and the model sees Lyons Peak's exact ridgeline, tower and vegetation in
training and again in validation, learns that scene, and reports a validation
number that says nothing about how it will behave on a camera it has never seen.
Split by camera and the validation number means what it claims to mean.

Labels come from FIgLib's own filenames. Each frame is named with its offset in
seconds from the labeled ignition, so frames before zero are negatives and frames
after are positives.

There is a caveat worth holding onto: smoke is not instantly visible at offset
zero. The first minute or two after ignition is often indistinguishable from
clear sky, so the earliest positives are partly mislabeled. IGNITION_GRACE drops
that ambiguous band from training rather than teaching the model that clear sky
is smoke.
"""

from __future__ import annotations

import glob
import os
import random
from dataclasses import dataclass

import numpy as np
import torch
from torch.utils.data import Dataset

from heuristic_fallback import DEFAULT_ROI
from model import load_frame

# Frames within this many seconds after the labeled ignition are dropped, since
# the plume is usually not visible yet and the label cannot be trusted.
IGNITION_GRACE = 120


# Cameras whose sequences are played back by the running system. They are held
# out of training entirely, so validate_replay.py is measuring the scorer on
# cameras and fires it has never been fitted to. Without this the trained scorer
# would be scored on its own training data and would look better than it is.
REPLAY_CAMERAS = {
    "hp-e-mobo-c",
    "cp-w-mobo-c",
    "lp-w-mobo-c",
    "rm-n-mobo-c",
    "smer-tcs8-mobo-c",
}


@dataclass
class Sequence:
    camera: str
    frames: list[str]
    label: int


def offset_of(path: str) -> int:
    return int(os.path.basename(path)[:-4])


def camera_of(folder: str) -> str:
    """FIgLib folders are named DATE_FireName_camera-direction-type.

    The camera is what we split on, so two fires seen from the same camera must
    land on the same side of the split.
    """
    parts = os.path.basename(folder).split("_")
    return parts[-1] if len(parts) >= 3 else os.path.basename(folder)


def build_sequences(root: str, seq_len: int = 5) -> list[Sequence]:
    sequences: list[Sequence] = []
    for folder in sorted(glob.glob(os.path.join(root, "*"))):
        if not os.path.isdir(folder):
            continue
        frames = sorted(glob.glob(os.path.join(folder, "*.jpg")), key=offset_of)
        if len(frames) < seq_len:
            continue
        camera = camera_of(folder)
        if camera in REPLAY_CAMERAS:
            continue
        for i in range(seq_len, len(frames) + 1):
            window = frames[i - seq_len : i]
            end = offset_of(window[-1])
            if 0 <= end < IGNITION_GRACE:
                continue
            sequences.append(Sequence(camera, window, 1 if end >= IGNITION_GRACE else 0))
    return sequences


def split_by_camera(
    sequences: list[Sequence], val_fraction: float = 0.2, test_fraction: float = 0.1, seed: int = 7
) -> tuple[list[Sequence], list[Sequence], list[Sequence]]:
    cameras = sorted({s.camera for s in sequences})
    rng = random.Random(seed)
    rng.shuffle(cameras)

    n_val = max(1, int(len(cameras) * val_fraction))
    n_test = max(1, int(len(cameras) * test_fraction))
    val = set(cameras[:n_val])
    test = set(cameras[n_val : n_val + n_test])

    train_set = [s for s in sequences if s.camera not in val and s.camera not in test]
    val_set = [s for s in sequences if s.camera in val]
    test_set = [s for s in sequences if s.camera in test]
    return train_set, val_set, test_set


class FIgLibSequences(Dataset):
    def __init__(self, sequences: list[Sequence], augment: bool = False, roi=DEFAULT_ROI):
        self.sequences = sequences
        self.augment = augment
        self.roi = roi

    def __len__(self) -> int:
        return len(self.sequences)

    def __getitem__(self, index: int):
        item = self.sequences[index]
        roi = self.roi

        if self.augment:
            # Time of day and haze move these scenes far more than rotation or
            # flipping ever would, which is the point PRD section 9 makes about
            # augmentation for this task. Brightness and contrast jitter stand in
            # for the light changing through a day. The ROI is also nudged, so
            # the model does not learn that smoke lives at one fixed height in
            # the frame.
            jitter = 0.03
            roi = (
                min(max(roi[0] + random.uniform(-jitter, jitter), 0.0), 0.2),
                min(max(roi[1] + random.uniform(-jitter, jitter), 0.0), 0.3),
                min(max(roi[2] + random.uniform(-jitter, jitter), 0.8), 1.0),
                min(max(roi[3] + random.uniform(-jitter, jitter), 0.5), 1.0),
            )

        frames = np.stack([load_frame(p, roi) for p in item.frames])

        if self.augment:
            frames = frames * random.uniform(0.85, 1.15) + random.uniform(-0.15, 0.15)
            if random.random() < 0.5:
                frames = frames[:, :, :, ::-1].copy()

        return torch.from_numpy(frames.astype(np.float32)), torch.tensor(
            float(item.label), dtype=torch.float32
        )
