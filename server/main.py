import base64
import io
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import httpx
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, Field
from PIL import Image
from ultralytics import YOLO
from anthropic import Anthropic, APIStatusError, APIError
from dotenv import load_dotenv

LOGGER = logging.getLogger("torch-detector")

# Load .env from the server directory
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)
LOGGER.info("Loading .env from: %s (exists: %s)", env_path, env_path.exists())
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
ANTHROPIC_CLIENT: Optional[Anthropic] = None
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-20250514")
ELEVEN_LABS_API_KEY = os.getenv("ELEVEN_LABS_API_KEY", "").strip().strip('"').strip("'")
ELEVEN_LABS_WEBHOOK_SECRET = os.getenv("ELEVEN_LABS_WEBHOOK_SECRET", "").strip().strip('"').strip("'")
ELEVEN_LABS_VOICE_ID = os.getenv("ELEVEN_LABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")  # Default voice
ELEVEN_LABS_WEBHOOK_URL = os.getenv("ELEVEN_LABS_WEBHOOK_URL", "https://localhost:5173/hackumass/TTSTHING")
SYSTEM_PROMPT = (
    "You are a safety-focused mobility assistant. Analyse incoming detections from a live camera feed "
    "and return concise, actionable guidance that highlights hazards, traffic signals, or obstacles. "
    "Respond in one or two short sentences. Avoid JSON."
)


@app.on_event("startup")
def load_model():
    global MODEL  # pylint: disable=global-statement
    global ANTHROPIC_CLIENT  # pylint: disable=global-statement
    try:
        MODEL = _ensure_model()
        LOGGER.info("Loaded YOLO model from %s", MODEL_PATH)
    except Exception as exc:  # pylint: disable=broad-except
        LOGGER.exception("Failed to load YOLO model: %s", exc)
        raise

    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip().strip('"').strip("'")
    if api_key:
        masked_key = api_key[:10] + "..." + api_key[-4:] if len(api_key) > 14 else "***"
        LOGGER.info("Found ANTHROPIC_API_KEY: %s", masked_key)
        try:
            ANTHROPIC_CLIENT = Anthropic(api_key=api_key)
            LOGGER.info("Anthropic client initialised for model %s", ANTHROPIC_MODEL)
        except Exception as exc:  # pylint: disable=broad-except
            ANTHROPIC_CLIENT = None
            LOGGER.error("Failed to initialise Anthropic client (LLM features disabled): %s", exc)
            LOGGER.error("This is non-fatal - detection will still work. Check Anthropic SDK version compatibility.")
    else:
        LOGGER.warning("ANTHROPIC_API_KEY not set; /api/llm will return 503 until configured.")


@app.get("/healthz")
def health_check():
    if MODEL is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "ok"}


@app.get("/debug/env")
def debug_env():
    """Debug endpoint to check environment variables"""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    return {
        "has_api_key": bool(api_key),
        "api_key_length": len(api_key) if api_key else 0,
        "api_key_preview": api_key[:10] + "..." if len(api_key) > 10 else "N/A",
        "anthropic_client_initialized": ANTHROPIC_CLIENT is not None,
        "env_file_exists": env_path.exists(),
    }


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


class LLMRequest(BaseModel):
    detections: List[Detection] = Field(default_factory=list)
    context: Dict[str, Any] = Field(default_factory=dict)
    prompt: Optional[str] = None


class LLMResponse(BaseModel):
    message: Optional[str] = None


def _render_prompt(payload: LLMRequest) -> str:
    detections = [
        detection.model_dump()
        for detection in payload.detections
    ]
    context = payload.context or {}
    parts = [
        "Analyse the following detections for potential hazards or guidance.",
        "Provide concise advice for a visually impaired pedestrian navigating traffic.",
        "Detections JSON:",
        json.dumps(detections, indent=2),
    ]
    if context:
        parts.append(f"Additional context: {json.dumps(context, indent=2)}")
    return "\n\n".join(parts)


@app.post("/api/llm", response_model=LLMResponse)
def generate_guidance(payload: LLMRequest):
    if not payload.detections:
        return LLMResponse(message=None)

    if ANTHROPIC_CLIENT is None:
        raise HTTPException(status_code=503, detail="Anthropic client is not configured")

    user_prompt = _render_prompt(payload)
    system_prompt = payload.prompt or SYSTEM_PROMPT

    try:
        response = ANTHROPIC_CLIENT.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=600,
            temperature=0.1,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": user_prompt,
                        }
                    ],
                }
            ],
        )
    except (APIError, APIStatusError) as exc:
        LOGGER.exception("Anthropic API error: %s", exc)
        raise HTTPException(status_code=502, detail="Anthropic service unavailable") from exc
    except Exception as exc:  # pylint: disable=broad-except
        LOGGER.exception("Unexpected error calling Anthropic: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate guidance") from exc

    message = ""
    for block in response.content:
        if block.type == "text":
            message += block.text

    return LLMResponse(message=message.strip() or None)


class TTSRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None


class TTSResponse(BaseModel):
    success: bool
    message: str


@app.post("/api/tts", response_model=TTSResponse)
async def text_to_speech(payload: TTSRequest):
    """Send text to Eleven Labs for TTS via webhook"""
    if not ELEVEN_LABS_API_KEY:
        raise HTTPException(status_code=503, detail="Eleven Labs API key not configured")

    voice_id = payload.voice_id or ELEVEN_LABS_VOICE_ID
    text = payload.text.strip()

    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream",
                headers={
                    "xi-api-key": ELEVEN_LABS_API_KEY,
                    "Content-Type": "application/json",
                },
                json={
                    "text": text,
                    "model_id": "eleven_multilingual_v2",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                    },
                },
                params={
                    "output_format": "mp3_44100_128",
                    "webhook_url": ELEVEN_LABS_WEBHOOK_URL,
                },
            )
            response.raise_for_status()
            return TTSResponse(success=True, message="TTS request sent to Eleven Labs")
    except httpx.HTTPStatusError as exc:
        LOGGER.exception("Eleven Labs API error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Eleven Labs API error: {exc.response.text}") from exc
    except Exception as exc:  # pylint: disable=broad-except
        LOGGER.exception("Failed to send TTS request: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to send TTS request") from exc


@app.post("/api/eleven-webhook")
async def eleven_webhook(
    request_data: Dict[str, Any],
    x_eleven_secret: Optional[str] = Header(None, alias="X-Eleven-Secret"),
):
    """Receive webhook events from Eleven Labs"""
    if ELEVEN_LABS_WEBHOOK_SECRET and x_eleven_secret != ELEVEN_LABS_WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    event_type = request_data.get("event")
    event_data = request_data.get("data", {})

    LOGGER.info("Eleven Labs webhook event: %s", event_type)

    if event_type == "audio_chunk":
        audio_base64 = event_data.get("audio")
        if audio_base64:
            try:
                audio_bytes = base64.b64decode(audio_base64)
                # Forward to frontend via WebSocket or store for retrieval
                # For now, just log it
                LOGGER.info("Received audio chunk: %d bytes", len(audio_bytes))
                # In a real implementation, you'd stream this to the frontend
            except Exception as exc:  # pylint: disable=broad-except
                LOGGER.exception("Failed to decode audio chunk: %s", exc)

    return {"status": "received"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

