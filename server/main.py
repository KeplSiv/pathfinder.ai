import asyncio
import base64
import io
import json
import logging
import os
import time
from collections import deque
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import httpx
import torch
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image
from ultralytics import YOLO
from anthropic import Anthropic, APIStatusError, APIError
from dotenv import load_dotenv
from transformers import AutoImageProcessor, AutoModelForDepthEstimation
try:
    from google import genai as google_genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    google_genai = None
try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False
    SentenceTransformer = None

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
    relative_depth: Optional[float] = None

class DetectionResponse(BaseModel):
    detections: List[Detection]


class ImagePayload(BaseModel):
    image: str
    confidence: Optional[float] = 0.3
    skip_depth: Optional[bool] = False  # Skip depth estimation for faster responses


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


# Global variables for depth estimation
DEPTH_DEVICE = torch.device("cpu")


def _load_depth_model():
    """Load MiDaS depth estimation model"""
    try:
        # Use fast processor if available, fallback to slow if needed
        try:
            processor = AutoImageProcessor.from_pretrained("Intel/dpt-hybrid-midas", use_fast=True)
        except Exception:
            # Fallback to slow processor if fast is not available
            processor = AutoImageProcessor.from_pretrained("Intel/dpt-hybrid-midas", use_fast=False)
        model = AutoModelForDepthEstimation.from_pretrained("Intel/dpt-hybrid-midas")
        model.eval()
        model.to(DEPTH_DEVICE)
        return processor, model
    except Exception as exc:
        LOGGER.exception("Failed to load depth model: %s", exc)
        return None, None


def get_depth_map(frame: Image.Image) -> Optional[np.ndarray]:
    """Generate depth map from image using MiDaS model"""
    if DEPTH_PROCESSOR is None or DEPTH_MODEL is None:
        return None
    
    try:
        # Ensure image is in RGB format
        if frame.mode != "RGB":
            frame = frame.convert("RGB")
        
        # Optimize: Resize image for faster depth estimation (depth models work well on smaller images)
        # Resize to max 512px width/height while maintaining aspect ratio for ~4x speedup
        original_width, original_height = frame.size
        max_size = 512
        
        if original_width > max_size or original_height > max_size:
            if original_width > original_height:
                new_width = max_size
                new_height = int(original_height * (max_size / original_width))
            else:
                new_height = max_size
                new_width = int(original_width * (max_size / original_height))
            frame = frame.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # Process image with explicit HWC format to avoid channel ambiguity
        inputs = DEPTH_PROCESSOR(
            images=frame, 
            return_tensors="pt",
            input_data_format="HWC"  # Height × Width × Channels (PIL/OpenCV convention)
        ).to(DEPTH_DEVICE)
        
        with torch.no_grad():
            outputs = DEPTH_MODEL(**inputs)
        
        # Extract depth map - shape should be (H, W) after squeeze
        depth = outputs.predicted_depth[0].squeeze().cpu().numpy()
        
        # Ensure depth is 2D (H, W)
        if len(depth.shape) > 2:
            depth = depth.squeeze()
        
        # Resize depth map back to original image size if we resized
        if original_width != frame.width or original_height != frame.height:
            depth_pil = Image.fromarray((depth * 255).astype(np.uint8))
            depth_pil = depth_pil.resize((original_width, original_height), Image.Resampling.LANCZOS)
            depth = np.array(depth_pil).astype(np.float32) / 255.0
        
        # Normalize 0 → 1 for relative depth
        depth_min = depth.min()
        depth_max = depth.max()
        if depth_max - depth_min > 0:
            depth_norm = (depth - depth_min) / (depth_max - depth_min)
        else:
            depth_norm = np.zeros_like(depth)
        
        return depth_norm
    except Exception as exc:
        LOGGER.warning("Depth estimation failed (non-fatal): %s", exc)
        return None


app = FastAPI(title="YOLO11n Traffic Detector", version="1.0.0")

# Add CORS middleware - allow all origins for hackathon (can restrict later)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins - fine for hackathon/prototyping
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

MODEL = None
DEPTH_PROCESSOR = None
DEPTH_MODEL = None
ANTHROPIC_CLIENT: Optional[Anthropic] = None
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-20250514")
GEMINI_CLIENT = None
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")
# Rate limiting for Gemini free tier (10 requests/minute)
GEMINI_REQUEST_TIMESTAMPS = deque(maxlen=10)  # Track last 10 requests
ELEVEN_LABS_API_KEY = os.getenv("ELEVEN_LABS_API_KEY", "").strip().strip('"').strip("'")
# Limit concurrent TTS requests to avoid overwhelming Eleven Labs API
TTS_SEMAPHORE = asyncio.Semaphore(2)  # Max 2 concurrent TTS requests
# Sentence transformer model for semantic similarity
SENTENCE_MODEL = None
ELEVEN_LABS_WEBHOOK_SECRET = os.getenv("ELEVEN_LABS_WEBHOOK_SECRET", "").strip().strip('"').strip("'")
ELEVEN_LABS_VOICE_ID = os.getenv("ELEVEN_LABS_VOICE_ID", "Qggl4b0xRMiqOwhPtVWT") 
ELEVEN_LABS_WEBHOOK_URL = os.getenv("ELEVEN_LABS_WEBHOOK_URL", "https://localhost:5173/hackumass/TTSTHING")
# Short alerts mode (1-3 words per detection) - token limited
SHORT_ALERTS_PROMPT = (
    "You are a safety-focused mobility assistant providing real-time alerts from a camera feed. "
    "Each detection includes a label (object type) and relative_depth (0.0 = closest/dangerous, 1.0 = farthest/safe). "
    ""
    "CRITICAL RULES: "
    "1. Output ONLY concise alerts using 2-4 words maximum per object type. "
    "2. Aggregate duplicates: say 'two people' not 'person person', 'three cars' not 'car car car'. "
    "3. Use proximity indicators based on depth: 'very close' (depth < 0.3), 'close' (0.3-0.6), 'ahead' (depth > 0.6). "
    "4. Prioritize nearby objects (low depth values) - mention them first. "
    "5. Format: [count] [object] [proximity] - e.g., 'Two people close', 'Car very close', 'Stop sign ahead'. "
    "6. Chain multiple alerts with commas: 'Car close, Person ahead, Fire very close'. "
    ""
    "DO NOT: "
    "- Use full sentences or explanations "
    "- Repeat the same alert multiple times "
    "- Use JSON format "
    "- Add unnecessary words like 'there is' or 'I see' "
    ""
    "Good examples: 'Two people close, Car ahead', 'Fire very close', 'Stop sign ahead, Person close' "
    "Bad examples: 'I can see a car that is very close', 'There are two people ahead of you', 'Person person car'"
)

# Sentences mode (full sentences) - for speech/TTS, no token limiters
SENTENCES_PROMPT = (
    "You are a safety-focused mobility assistant. Analyse incoming detections from a live camera feed "
    "and return concise, actionable guidance that highlights hazards, traffic signals, or obstacles. "
    "Each detection includes relative_depth (0.0 = closest/nearby, 1.0 = farthest/distant) - use this "
    "to prioritize warnings about nearby objects and provide spatial context. "
    "CRITICAL: Aggregate similar detections - if there are multiple of the same type, say 'two people' instead of "
    "'person person', 'three cars' instead of 'car car car', etc. "
    "You MUST respond in a complete, natural sentence suitable for text-to-speech. "
    "DO NOT use short keywords or fragments. Use proper grammar and full sentences. "
    "Example good output: 'There are two people ahead and a car approaching from the left.' "
    "Example bad output: 'Person person car' or 'Two people, car close'"
)

# Default to sentences mode
SYSTEM_PROMPT = SENTENCES_PROMPT


@app.on_event("startup")
def load_model():
    global MODEL  # pylint: disable=global-statement
    global DEPTH_PROCESSOR, DEPTH_MODEL  # pylint: disable=global-statement
    global ANTHROPIC_CLIENT, GEMINI_CLIENT  # pylint: disable=global-statement
    try:
        MODEL = _ensure_model()
        LOGGER.info("Loaded YOLO model from %s", MODEL_PATH)
    except Exception as exc:  # pylint: disable=broad-except
        LOGGER.exception("Failed to load YOLO model: %s", exc)
        raise

    # Load depth estimation model
    try:
        DEPTH_PROCESSOR, DEPTH_MODEL = _load_depth_model()
        if DEPTH_PROCESSOR is not None and DEPTH_MODEL is not None:
            LOGGER.info("Loaded MiDaS depth estimation model")
        else:
            LOGGER.warning("Depth estimation model not loaded; depth features will be disabled")
    except Exception as exc:  # pylint: disable=broad-except
        LOGGER.warning("Failed to load depth model (non-fatal): %s", exc)
        DEPTH_PROCESSOR = None
        DEPTH_MODEL = None

    # Initialize Anthropic (Claude) client
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip().strip('"').strip("'")
    if api_key:
        masked_key = api_key[:10] + "..." + api_key[-4:] if len(api_key) > 14 else "***"
        LOGGER.info("Found ANTHROPIC_API_KEY: %s", masked_key)
        try:
            ANTHROPIC_CLIENT = Anthropic(api_key=api_key)
            LOGGER.info("Anthropic client initialised for model %s", ANTHROPIC_MODEL)
        except Exception as exc:  # pylint: disable=broad-except
            ANTHROPIC_CLIENT = None
            LOGGER.error("Failed to initialise Anthropic client (Claude features disabled): %s", exc)
            LOGGER.error("This is non-fatal - detection will still work. Check Anthropic SDK version compatibility.")
    else:
        LOGGER.warning("ANTHROPIC_API_KEY not set; Claude features will be disabled.")

    # Initialize Gemini client
    if GEMINI_AVAILABLE:
        gemini_key = os.getenv("GEMINI_API_KEY", "").strip().strip('"').strip("'")
        if gemini_key:
            masked_key = gemini_key[:10] + "..." + gemini_key[-4:] if len(gemini_key) > 14 else "***"
            LOGGER.info("Found GEMINI_API_KEY: %s", masked_key)
            try:
                GEMINI_CLIENT = google_genai.Client(api_key=gemini_key)
                LOGGER.info("Gemini client initialised for model %s", GEMINI_MODEL)
            except Exception as exc:  # pylint: disable=broad-except
                GEMINI_CLIENT = None
                LOGGER.warning("Failed to initialise Gemini client (Gemini features disabled): %s", exc)
        else:
            LOGGER.warning("GEMINI_API_KEY not set; Gemini features will be disabled.")
    else:
        LOGGER.warning("google-genai package not installed; Gemini features will be disabled.")

    # Load sentence transformer model for semantic similarity
    if SENTENCE_TRANSFORMERS_AVAILABLE:
        try:
            SENTENCE_MODEL = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
            LOGGER.info("Loaded sentence transformer model for semantic similarity")
        except Exception as exc:  # pylint: disable=broad-except
            SENTENCE_MODEL = None
            LOGGER.warning("Failed to load sentence transformer model (similarity checks disabled): %s", exc)
    else:
        LOGGER.warning("sentence-transformers package not installed; semantic similarity checks will be disabled.")


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

    # Generate depth map if depth model is available and not skipped (non-blocking, errors won't break detection)
    depth_map = None
    if not payload.skip_depth and DEPTH_PROCESSOR is not None and DEPTH_MODEL is not None:
        try:
            depth_map = get_depth_map(image)
            if depth_map is not None:
                # Resize depth map to match image dimensions if needed
                if depth_map.shape != (image.height, image.width):
                    from PIL import Image as PILImage
                    depth_pil = PILImage.fromarray((depth_map * 255).astype(np.uint8))
                    depth_pil = depth_pil.resize((image.width, image.height), PILImage.Resampling.LANCZOS)
                    depth_map = np.array(depth_pil).astype(np.float32) / 255.0
        except Exception as exc:
            # Depth estimation failed, but continue with YOLO detections
            LOGGER.warning("Depth estimation failed (non-fatal): %s", exc)
            depth_map = None

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
            
            # Calculate relative depth if depth map is available
            relative_depth = None
            if depth_map is not None:
                try:
                    # Convert bbox coordinates to integers and ensure they're within bounds
                    x1_int = max(0, int(x1))
                    y1_int = max(0, int(y1))
                    x2_int = min(depth_map.shape[1], int(x2))
                    y2_int = min(depth_map.shape[0], int(y2))
                    
                    if x2_int > x1_int and y2_int > y1_int:
                        # Crop depth region inside bbox
                        region = depth_map[y1_int:y2_int, x1_int:x2_int]
                        # Compute median relative depth
                        relative_depth = float(np.median(region))
                except Exception as exc:
                    LOGGER.warning("Failed to compute depth for detection: %s", exc)
            
            detections.append(
                Detection(
                    label=label,
                    confidence=confidence,
                    bbox=[x1, y1, x2 - x1, y2 - y1],
                    updatedAt=timestamp,
                    relative_depth=relative_depth,
                )
            )

    return DetectionResponse(detections=detections)


class LLMRequest(BaseModel):
    detections: List[Detection] = Field(default_factory=list)
    context: Dict[str, Any] = Field(default_factory=dict)
    prompt: Optional[str] = None
    provider: Optional[str] = "claude"  # "claude" or "gemini"
    mode: Optional[str] = "sentences"  # "sentences" or "short_alerts"


class LLMResponse(BaseModel):
    message: Optional[str] = None


def _render_prompt(payload: LLMRequest) -> str:
    detections = [
        detection.model_dump()
        for detection in payload.detections
    ]
    context = payload.context or {}
    parts = [
        "Detections:",
        json.dumps(detections, indent=2),
    ]
    if context:
        parts.append(f"Context: {json.dumps(context, indent=2)}")
    return "\n\n".join(parts)


@app.post("/api/llm", response_model=LLMResponse)
def generate_guidance(payload: LLMRequest):
    if not payload.detections:
        return LLMResponse(message=None)

    provider = (payload.provider or "claude").lower()
    mode = (payload.mode or "sentences").lower()
    user_prompt = _render_prompt(payload)
    
    # Select prompt based on mode
    # "sentences" mode: uses SENTENCES_PROMPT (full sentences) + no token limiters (for speech/TTS)
    # "short_alerts" mode: uses SHORT_ALERTS_PROMPT (1-3 words) + token limiters
    if payload.prompt:
        system_prompt = payload.prompt
    elif mode == "sentences":
        system_prompt = SENTENCES_PROMPT  # Full sentences prompt
    else:  # short_alerts mode (default)
        system_prompt = SHORT_ALERTS_PROMPT  # Short alerts prompt
    
    # Determine token limits based on mode
    # Reduced tokens for faster responses while maintaining quality
    # Sentences mode: 300 tokens (optimized for speed)
    # Short alerts mode: 25 tokens (optimized for speed)
    max_tokens = 300 if mode == "sentences" else 25

    if provider == "gemini":
        if GEMINI_CLIENT is None:
            raise HTTPException(status_code=503, detail="Gemini client is not configured")
        
        # Rate limiting: Free tier allows 10 requests per minute
        current_time = time.time()
        # Remove timestamps older than 60 seconds
        while GEMINI_REQUEST_TIMESTAMPS and current_time - GEMINI_REQUEST_TIMESTAMPS[0] > 60:
            GEMINI_REQUEST_TIMESTAMPS.popleft()
        
        # Check if we're at the limit
        if len(GEMINI_REQUEST_TIMESTAMPS) >= 10:
            oldest_request = GEMINI_REQUEST_TIMESTAMPS[0]
            wait_time = 60 - (current_time - oldest_request)
            if wait_time > 0:
                retry_msg = f"Gemini API rate limit exceeded (10 requests/minute). Please wait {int(wait_time)} seconds or switch to Claude."
                raise HTTPException(status_code=429, detail=retry_msg)
        
        try:
            # Record this request
            GEMINI_REQUEST_TIMESTAMPS.append(current_time)
            
            # Combine system prompt and user prompt for Gemini
            full_prompt = f"{system_prompt}\n\n{user_prompt}"
            response = GEMINI_CLIENT.models.generate_content(
                model=GEMINI_MODEL,
                contents=full_prompt,
                config={"max_output_tokens": max_tokens}
            )
            # Handle response - check if text exists and is not None
            if hasattr(response, 'text') and response.text is not None:
                message = response.text.strip() if response.text.strip() else None
            else:
                # Try to get text from response candidates if available
                if hasattr(response, 'candidates') and response.candidates:
                    candidate = response.candidates[0]
                    if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                        parts = candidate.content.parts
                        if parts:
                            message = parts[0].text.strip() if hasattr(parts[0], 'text') and parts[0].text else None
                        else:
                            message = None
                    else:
                        message = None
                else:
                    message = None
            
            return LLMResponse(message=message)
        except Exception as exc:  # pylint: disable=broad-except
            # Check if it's a rate limit error (429)
            error_str = str(exc)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str or "quota" in error_str.lower():
                LOGGER.warning("Gemini rate limit exceeded: %s", exc)
                # Extract retry delay if available
                retry_msg = "Gemini API rate limit exceeded (10 requests/minute on free tier). Please wait a moment or switch to Claude."
                raise HTTPException(status_code=429, detail=retry_msg)
            elif hasattr(exc, 'status_code') and exc.status_code == 429:
                # Handle rate limit from our own rate limiter
                LOGGER.warning("Gemini rate limit (prevented): %s", exc)
                raise HTTPException(status_code=429, detail=str(exc))
            else:
                LOGGER.exception("Gemini API error: %s", exc)
                # Provide more detailed error message
                error_detail = f"Gemini API error: {str(exc)}"
                if "API key" in error_str.lower() or "authentication" in error_str.lower():
                    error_detail = "Gemini API key invalid or not configured. Please check your GEMINI_API_KEY."
                elif "quota" in error_str.lower():
                    error_detail = "Gemini API quota exceeded. Please check your usage limits or switch to Claude."
                raise HTTPException(status_code=502, detail=error_detail) from exc
    
    else:  # Default to Claude
        if ANTHROPIC_CLIENT is None:
            raise HTTPException(status_code=503, detail="Anthropic client is not configured")

        try:
            response = ANTHROPIC_CLIENT.messages.create(
                model=ANTHROPIC_MODEL,
                max_tokens=max_tokens,
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
        # Don't log warning for every request - only log at startup or first request
        return TTSResponse(success=False, message="Eleven Labs API key not configured")

    voice_id = payload.voice_id or ELEVEN_LABS_VOICE_ID
    text = payload.text.strip()

    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    # Limit concurrent requests using semaphore
    async with TTS_SEMAPHORE:
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
            # Handle 401 Unauthorized (invalid API key) - only log at debug level to reduce noise
            if exc.response.status_code == 401:
                # Log at debug level instead of warning to reduce log spam
                # Frontend will fallback to browser TTS anyway
                LOGGER.debug("Eleven Labs API returned 401 (will fallback to browser TTS): %s", 
                           exc.response.text[:100] if exc.response.text else "Unauthorized")
                return TTSResponse(success=False, message="Eleven Labs API key invalid or expired")
            else:
                LOGGER.warning("Eleven Labs API error (status %d): %s", exc.response.status_code, exc.response.text[:200])
                return TTSResponse(success=False, message=f"Eleven Labs API error: {exc.response.status_code}")
        except Exception as exc:  # pylint: disable=broad-except
            LOGGER.debug("Failed to send TTS request (will fallback to browser TTS): %s", exc)
            return TTSResponse(success=False, message="Failed to send TTS request")


class SimilarityRequest(BaseModel):
    text: str
    previous_texts: List[str] = Field(default_factory=list)


class SimilarityResponse(BaseModel):
    is_similar: bool
    max_similarity: float
    threshold: float = 0.5


@app.post("/api/similarity", response_model=SimilarityResponse)
def check_similarity(payload: SimilarityRequest):
    """Check if text is semantically similar to previous texts using sentence embeddings"""
    if SENTENCE_MODEL is None:
        # If model not available, fallback to simple string comparison
        text_lower = payload.text.lower().strip()
        for prev_text in payload.previous_texts:
            prev_lower = prev_text.lower().strip()
            if text_lower == prev_lower or text_lower in prev_lower or prev_lower in text_lower:
                return SimilarityResponse(is_similar=True, max_similarity=1.0, threshold=0.85)
        return SimilarityResponse(is_similar=False, max_similarity=0.0, threshold=0.85)

    try:
        # Encode the new text
        new_embedding = SENTENCE_MODEL.encode(payload.text, convert_to_numpy=True)
        
        if not payload.previous_texts:
            return SimilarityResponse(is_similar=False, max_similarity=0.0, threshold=0.85)
        
        # Encode all previous texts
        prev_embeddings = SENTENCE_MODEL.encode(payload.previous_texts, convert_to_numpy=True)
        
        # Compute cosine similarity with all previous texts
        # Cosine similarity: dot product / (norm1 * norm2)
        new_norm = np.linalg.norm(new_embedding)
        similarities = []
        
        for prev_emb in prev_embeddings:
            prev_norm = np.linalg.norm(prev_emb)
            if new_norm > 0 and prev_norm > 0:
                cos_sim = np.dot(new_embedding, prev_emb) / (new_norm * prev_norm)
                similarities.append(float(cos_sim))
            else:
                similarities.append(0.0)
        
        max_sim = max(similarities) if similarities else 0.0
        threshold = 0.85  # Consider similar if cosine similarity > 0.85
        
        return SimilarityResponse(
            is_similar=max_sim >= threshold,
            max_similarity=max_sim,
            threshold=threshold
        )
    except Exception as exc:  # pylint: disable=broad-except
        LOGGER.warning("Similarity check failed: %s", exc)
        # Fallback: allow TTS if similarity check fails
        return SimilarityResponse(is_similar=False, max_similarity=0.0, threshold=0.85)


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

