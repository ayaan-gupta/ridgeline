"""Model service.

POST /infer scores a short sequence of frames and returns a smoke probability, a
bounding region, and the per-frame scores behind the answer.

Two scorers live behind the same endpoint. If a trained checkpoint is present at
MODEL_CHECKPOINT it is loaded and used. If it is missing or fails to load, the
frame-differencing scorer in heuristic_fallback.py runs instead and /health says
so plainly. The service never refuses to score, because a detection pipeline that
goes silent when a checkpoint is missing is worse than one running on a simpler
scorer.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field

import heuristic_fallback

log = logging.getLogger("ridgeline.model")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

CHECKPOINT_PATH = os.environ.get("MODEL_CHECKPOINT", "/app/weights/smokenet.pt")

# auto      use the checkpoint when one loads, otherwise the heuristic
# trained   require the checkpoint, and fail loudly at startup if it will not load
# heuristic never load a checkpoint, even if one is sitting there
#
# The override exists because "which scorer is running" should be a decision
# someone made, not a side effect of whether a file happens to be on disk. It is
# also how you compare the two on the same sequences.
SCORER_MODE = os.environ.get("SCORER", "auto").strip().lower()

app = FastAPI(title="Ridgeline model service", version="1.0")

# Populated at startup if a checkpoint loads.
_trained = None
_trained_meta: dict = {}


class InferRequest(BaseModel):
    camera_id: str
    frames: list[str] = Field(..., description="Frame paths, oldest first.")
    background_frames: list[str] | None = Field(
        None,
        description="Known-clear frames for this camera. Used as the background "
        "reference so a slowly growing plume does not erase its own signal.",
    )
    roi: list[float] | None = Field(
        None, description="Normalized x0, y0, x1, y1 crop to score within."
    )


class InferResponse(BaseModel):
    smoke_probability: float
    bbox: dict | None
    per_frame_scores: list[float]
    scorer: Literal["trained", "heuristic"]
    elapsed_ms: int
    detail: dict


@app.on_event("startup")
def load_checkpoint() -> None:
    global _trained, _trained_meta
    if SCORER_MODE == "heuristic":
        log.info("SCORER=heuristic, so the checkpoint is ignored.")
        return
    if not os.path.exists(CHECKPOINT_PATH):
        if SCORER_MODE == "trained":
            raise RuntimeError(
                f"SCORER=trained but no checkpoint at {CHECKPOINT_PATH}. "
                "Run train.py, or set SCORER=auto to fall back to the heuristic."
            )
        log.info("No checkpoint at %s. Scoring with the frame-differencing fallback.", CHECKPOINT_PATH)
        return
    try:
        import torch

        from model import SmokeNet

        ckpt = torch.load(CHECKPOINT_PATH, map_location="cpu", weights_only=False)
        net = SmokeNet(backbone=ckpt.get("backbone", "resnet18"))
        net.load_state_dict(ckpt["state_dict"])
        net.eval()
        _trained = net
        _trained_meta = {
            "backbone": ckpt.get("backbone", "resnet18"),
            "trained_at": ckpt.get("trained_at"),
            "val_precision": ckpt.get("val_precision"),
            "val_recall": ckpt.get("val_recall"),
            "sequence_length": ckpt.get("sequence_length", 5),
        }
        log.info("Loaded checkpoint %s: %s", CHECKPOINT_PATH, _trained_meta)
    except Exception as exc:  # noqa: BLE001
        if SCORER_MODE == "trained":
            raise
        log.warning("Checkpoint at %s failed to load (%s). Using the fallback.", CHECKPOINT_PATH, exc)
        _trained = None


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "scorer": "trained" if _trained is not None else "heuristic",
        "scorer_mode": SCORER_MODE,
        "checkpoint_path": CHECKPOINT_PATH,
        "checkpoint_loaded": _trained is not None,
        "checkpoint": _trained_meta or None,
    }


@app.post("/infer", response_model=InferResponse)
def infer(req: InferRequest) -> InferResponse:
    started = time.perf_counter()
    roi = tuple(req.roi) if req.roi and len(req.roi) == 4 else None

    missing = [p for p in req.frames if not os.path.exists(p)]
    if missing:
        return InferResponse(
            smoke_probability=0.0,
            bbox=None,
            per_frame_scores=[],
            scorer="heuristic",
            elapsed_ms=0,
            detail={"error": "frames not readable", "missing": missing[:5]},
        )

    if _trained is not None:
        result = _score_trained(req, roi)
    else:
        result = heuristic_fallback.score_sequence(
            req.frames, background_paths=req.background_frames, roi=roi
        )

    return InferResponse(
        smoke_probability=result.smoke_probability,
        bbox=result.bbox,
        per_frame_scores=result.per_frame_scores,
        scorer=result.scorer,
        elapsed_ms=int((time.perf_counter() - started) * 1000),
        detail=result.detail,
    )


def _score_trained(req: InferRequest, roi) -> heuristic_fallback.ScoreResult:
    """Run the CNN plus LSTM checkpoint over the window."""
    import torch

    from model import prepare_sequence

    seq_len = _trained_meta.get("sequence_length", 5)
    frames = req.frames[-seq_len:]
    if len(frames) < seq_len:
        frames = [frames[0]] * (seq_len - len(frames)) + frames

    tensor = prepare_sequence(frames, roi=roi or heuristic_fallback.DEFAULT_ROI)
    with torch.no_grad():
        logits, per_frame_logits = _trained(tensor.unsqueeze(0))
        prob = float(torch.sigmoid(logits)[0].item())
        per_frame = [float(v) for v in torch.sigmoid(per_frame_logits)[0].tolist()]

    # The trained head classifies but does not localize, so the region shown to
    # the operator still comes from the tile scorer. A box the operator can look
    # at beats no box, and this keeps the two scorers visually consistent.
    geom = heuristic_fallback.score_sequence(
        req.frames, background_paths=req.background_frames, roi=roi
    )

    return heuristic_fallback.ScoreResult(
        smoke_probability=round(prob, 4),
        bbox=geom.bbox,
        per_frame_scores=[round(p, 4) for p in per_frame],
        scorer="trained",
        detail={**_trained_meta, "bbox_source": "tile scorer"},
    )
