"""Fine-tunes the CNN plus LSTM on FIgLib.

Fine-tuning, not training from scratch. The backbone starts from ImageNet
weights with everything frozen, then the final residual stage opens after
FREEZE_EPOCHS, which is the progressive unfreezing PRD section 9 asks for. With a
few thousand sequences, unfreezing the whole network immediately just overwrites
useful features with noise.

Reported metrics are precision, recall and false alarms per camera per day.
Accuracy is deliberately absent. In a full day of camera time smoke is rare, so a
model that answers "no smoke" to everything scores extremely well on accuracy and
is worth nothing.

Usage:
  python fetch_figlib.py --sequences 40
  python train.py --epochs 6

The checkpoint lands in weights/smokenet.pt, which is where inference_server.py
looks. Restart the model service and it picks it up.
"""

from __future__ import annotations

import argparse
import json
import os
import time

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from dataset import FIgLibSequences, build_sequences, split_by_camera
from model import SmokeNet

FREEZE_EPOCHS = 2
# FIgLib frames are one minute apart, so one negative sequence is one minute of
# clear camera time. Used to convert false positives into a per-day rate.
SECONDS_PER_FRAME = 60


def evaluate(net, loader, device, threshold: float = 0.6) -> dict:
    net.eval()
    tp = fp = tn = fn = 0
    with torch.no_grad():
        for frames, labels in loader:
            frames = frames.to(device)
            logits, _ = net(frames)
            predicted = (torch.sigmoid(logits).cpu().numpy() >= threshold).astype(int)
            actual = labels.numpy().astype(int)
            tp += int(((predicted == 1) & (actual == 1)).sum())
            fp += int(((predicted == 1) & (actual == 0)).sum())
            tn += int(((predicted == 0) & (actual == 0)).sum())
            fn += int(((predicted == 0) & (actual == 1)).sum())

    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    clear_minutes = max(tn + fp, 1) * (SECONDS_PER_FRAME / 60)
    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(2 * precision * recall / (precision + recall), 4) if precision + recall else 0.0,
        # This counts single frames over threshold, so it is the rate before the
        # consecutive-frame rule gets to suppress anything. The number the
        # operator actually lives with is lower, and validate_replay.py measures
        # that one end to end.
        "false_positives_per_camera_per_day": round(fp * 1440 / clear_minutes, 2),
        "counts": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=os.environ.get("FIGLIB_DIR", "/data/figlib"))
    parser.add_argument("--out", default="weights/smokenet.pt")
    parser.add_argument("--epochs", type=int, default=6)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--sequence-length", type=int, default=5)
    parser.add_argument("--backbone", default="resnet18")
    parser.add_argument("--limit", type=int, default=0, help="Cap training sequences for a quick run.")
    parser.add_argument(
        "--workers",
        type=int,
        default=int(os.environ.get("TRAIN_WORKERS", "2")),
        help="DataLoader workers. Use 0 if shared memory is constrained.",
    )
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device {device}")

    sequences = build_sequences(args.data, args.sequence_length)
    if not sequences:
        print(f"No sequences found in {args.data}. Run fetch_figlib.py first.")
        return 1

    train_set, val_set, test_set = split_by_camera(sequences)
    cameras = len({s.camera for s in sequences})
    print(
        f"{len(sequences)} sequences from {cameras} cameras: "
        f"{len(train_set)} train, {len(val_set)} val, {len(test_set)} test"
    )
    print("split is by camera, so no scene appears on both sides")

    if args.limit:
        train_set = train_set[: args.limit]

    positives = sum(s.label for s in train_set)
    negatives = len(train_set) - positives
    print(f"train balance: {positives} smoke, {negatives} clear")

    loaders = {
        "train": DataLoader(
            FIgLibSequences(train_set, augment=True),
            batch_size=args.batch_size,
            shuffle=True,
            num_workers=args.workers,
        ),
        "val": DataLoader(FIgLibSequences(val_set), batch_size=args.batch_size, num_workers=args.workers),
        "test": DataLoader(FIgLibSequences(test_set), batch_size=args.batch_size, num_workers=args.workers),
    }

    net = SmokeNet(backbone=args.backbone, pretrained=True).to(device)
    net.freeze_backbone(True)

    # Smoke frames are the minority, so the positive class is weighted up rather
    # than letting the model take the easy road of answering "clear" every time.
    pos_weight = torch.tensor([max(negatives, 1) / max(positives, 1)], device=device)
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = torch.optim.AdamW(
        [p for p in net.parameters() if p.requires_grad], lr=args.lr, weight_decay=1e-4
    )

    best = {"f1": -1.0}
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)

    for epoch in range(1, args.epochs + 1):
        if epoch == FREEZE_EPOCHS + 1:
            print("unfreezing the final backbone stage")
            net.unfreeze_last_block()
            optimizer = torch.optim.AdamW(
                [p for p in net.parameters() if p.requires_grad],
                lr=args.lr * 0.3,
                weight_decay=1e-4,
            )

        net.train()
        losses = []
        started = time.perf_counter()
        for frames, labels in loaders["train"]:
            frames, labels = frames.to(device), labels.to(device)
            optimizer.zero_grad()
            logits, _ = net(frames)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()
            losses.append(float(loss.item()))

        metrics = evaluate(net, loaders["val"], device)
        print(
            f"epoch {epoch}  loss {np.mean(losses):.4f}  "
            f"precision {metrics['precision']}  recall {metrics['recall']}  "
            f"f1 {metrics['f1']}  fp/camera/day {metrics['false_positives_per_camera_per_day']}  "
            f"({time.perf_counter() - started:.0f}s)"
        )

        if metrics["f1"] > best["f1"]:
            best = metrics
            torch.save(
                {
                    "state_dict": net.state_dict(),
                    "backbone": args.backbone,
                    "sequence_length": args.sequence_length,
                    "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "val_precision": metrics["precision"],
                    "val_recall": metrics["recall"],
                },
                args.out,
            )
            print(f"  saved {args.out}")

    print("\nheld-out cameras (never seen in training):")
    print(json.dumps(evaluate(net, loaders["test"], device), indent=2))
    print(f"\nbest validation: {json.dumps(best)}")
    print(f"checkpoint at {args.out}. Restart the model service to load it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
