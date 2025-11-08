import base64
import io
import logging
from pathlib import Path
from typing import List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image
from ultralytics import YOLO

LOGGER = logging.getLogger("torch-detector")
MODEL_PATH = Path(__file__).resolve().parent / "models" / "yolo11n.pt"
TRAFFIC_LABELS = {
    "person",
    "bicycle",
    "car",
    "motorcycle",
    "bus",
    "train",
    "truck",
    "boat",
    "traffic light",
    "fire hydrant",
    "stop sign",
}


class Detection(BaseModel):
    label: str
    confidence: float
    bbox: List[float]
    updatedAt: int


class DetectionResponse(BaseModel):
    detections: List[Detection]


class ImagePayload(BaseModel):
    image: str
    confidence: Optional[float] = 0.3


def _decode_image(data_url: str) -> Image.Image:
    if "," in data_url:
        _, encoded = data_url.split(",", 1)
    else:
        encoded = data_url
    try:
        image_bytes = base64.b64decode(encoded)
    except base64.binascii.Error as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 data") from exc

    try:
        return Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:  # pylint: disable=broad-except
        raise HTTPException(status_code=400, detail="Invalid image data") from exc


def _ensure_model() -> YOLO:
    if not MODEL_PATH.exists():
        raise RuntimeError(
            f"Model file not found at {MODEL_PATH}. "
            "Copy yolo11n.pt into server/models/ before starting the server."
        )
    return YOLO(MODEL_PATH.as_posix())


app = FastAPI(title="YOLO11n Traffic Detector", version="1.0.0")
MODEL = None


@app.on_event("startup")
def load_model():
    global MODEL  # pylint: disable=global-statement
    try:
        MODEL = _ensure_model()
        LOGGER.info("Loaded YOLO model from %s", MODEL_PATH)
    except Exception as exc:  # pylint: disable=broad-except
        LOGGER.exception("Failed to load YOLO model: %s", exc)
        raise


@app.get("/healthz")
def health_check():
    if MODEL is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "ok"}


@app.post("/api/detect", response_model=DetectionResponse)
def detect(payload: ImagePayload):
    if MODEL is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    image = _decode_image(payload.image)
    np_image = np.array(image)

    try:
        results = MODEL(np_image, verbose=False)
    except Exception as exc:  # pylint: disable=broad-except
        LOGGER.exception("Model inference failed: %s", exc)
        raise HTTPException(status_code=500, detail="Model inference failed") from exc

    detections = []
    from time import time

    timestamp = int(time() * 1000)
    threshold = payload.confidence or 0.3

    for result in results:
        if isinstance(result.names, dict):
            names = result.names
        else:
            names = {idx: name for idx, name in enumerate(result.names)}
        boxes = result.boxes
        if boxes is None:
            continue
        for box in boxes:
            cls_id = int(box.cls.item())
            label = names.get(cls_id, str(cls_id))
            if label not in TRAFFIC_LABELS:
                continue
            confidence = float(box.conf.item())
            if confidence < threshold:
                continue
            x1, y1, x2, y2 = map(float, box.xyxy[0].tolist())
            detections.append(
                Detection(
                    label=label,
                    confidence=confidence,
                    bbox=[x1, y1, x2 - x1, y2 - y1],
                    updatedAt=timestamp,
                )
            )

    return DetectionResponse(detections=detections)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

