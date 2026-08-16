"""CNN plus LSTM architecture for spatiotemporal smoke detection.

This mirrors the SmokeyNet approach described in PRD section 9: a frozen-then-
progressively-unfrozen ImageNet backbone extracts per-frame features, and a small
LSTM reasons over a short window of those features. The reason for the recurrent
head rather than a single-frame classifier is stated in the PRD and holds up in
practice: a still frame cannot separate smoke from fog, but a plume grows and
drifts in a way that fog does not.

The model emits two heads:
  - a sequence logit, the answer for the window
  - a per-frame logit for every frame in the window

The per-frame head exists because the decision layer needs one number per
captured frame in order to apply the consecutive-frame rule, and because those
numbers are what the operator sees in the frame strip. A model that only emitted
a sequence-level answer would make the interface unable to show its work.
"""

from __future__ import annotations

import numpy as np
import torch
import torch.nn as nn
from PIL import Image

IMAGE_SIZE = 224
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class SmokeNet(nn.Module):
    def __init__(self, backbone: str = "resnet18", hidden: int = 256, pretrained: bool = False):
        super().__init__()
        import torchvision.models as tvm

        if backbone == "resnet18":
            net = tvm.resnet18(weights=tvm.ResNet18_Weights.DEFAULT if pretrained else None)
            feat_dim = 512
        elif backbone == "resnet34":
            net = tvm.resnet34(weights=tvm.ResNet34_Weights.DEFAULT if pretrained else None)
            feat_dim = 512
        else:
            raise ValueError(f"unsupported backbone: {backbone}")

        self.backbone_name = backbone
        # Everything except the classifier. Output is (B, feat_dim, 1, 1).
        self.features = nn.Sequential(*list(net.children())[:-1])
        self.lstm = nn.LSTM(feat_dim, hidden, batch_first=True)
        self.sequence_head = nn.Linear(hidden, 1)
        # The per-frame head reads the LSTM output at each step, so a frame's
        # score reflects everything seen up to that frame rather than the frame
        # alone. That is the property the consecutive-frame rule depends on.
        self.frame_head = nn.Linear(hidden, 1)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """x: (B, T, 3, H, W) -> (sequence_logits (B,), per_frame_logits (B, T))"""
        b, t = x.shape[:2]
        feats = self.features(x.flatten(0, 1)).flatten(1)  # (B*T, feat_dim)
        feats = feats.view(b, t, -1)
        out, _ = self.lstm(feats)  # (B, T, hidden)
        return self.sequence_head(out[:, -1]).squeeze(-1), self.frame_head(out).squeeze(-1)

    def freeze_backbone(self, frozen: bool = True) -> None:
        for p in self.features.parameters():
            p.requires_grad = not frozen

    def unfreeze_last_block(self) -> None:
        """Progressive unfreezing: open the final residual stage only."""
        for p in self.features[-3:].parameters():
            p.requires_grad = True


def load_frame(path: str, roi: tuple[float, float, float, float]) -> np.ndarray:
    with Image.open(path) as im:
        im = im.convert("RGB")
        w, h = im.size
        im = im.crop((int(w * roi[0]), int(h * roi[1]), int(w * roi[2]), int(h * roi[3])))
        im = im.resize((IMAGE_SIZE, IMAGE_SIZE), Image.BILINEAR)
        arr = np.asarray(im, dtype=np.float32) / 255.0
    arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
    return arr.transpose(2, 0, 1)


def prepare_sequence(paths, roi: tuple[float, float, float, float]) -> torch.Tensor:
    """(T, 3, H, W) float tensor ready for SmokeNet."""
    return torch.from_numpy(np.stack([load_frame(p, roi) for p in paths]))
