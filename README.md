# Pathfinder AI

A hackathon project combining a React + Vite front-end with a FastAPI backend for real-time traffic/object detection, contextual guidance, and optional LLM/audio feedback.

## Hack UMass 2025 Summary

- Built a real-time assistive navigation system using YOLOv8, MiDaS monocular depth estimation, Gemini-style LLM guidance, and FastAPI.
- Achieved fast inference and guidance generation with end-to-end latency near 300ms for detection and context-aware response.
- Replaced expensive LiDAR hardware with MiDaS-based monocular depth estimation, enabling commodity hardware inference under 0.75s and delivering relative depth mapping for proximity-aware guidance.
- Generates concise, spoken safety alerts and visual overlays for traffic objects, pedestrians, and scene semantics.

## Features

- Real-time browser camera stream with multi-camera selection and live video rendering.
- YOLOv8-based object detection on server-side image frames, filtering traffic-relevant classes: people, bicycles, cars, motorcycles, buses, trains, trucks, boats, traffic lights, fire hydrants, and stop signs.
- Monocular depth estimation via Hugging Face MiDaS (`Intel/dpt-hybrid-midas`) to compute relative depth for each bounding box.
- Relative depth mapping and proximity analysis to support guidance like "very close", "close", and "ahead".
- Visual bounding box overlay on the live feed, with optional toggle for cleaner view.
- Configurable guidance controls: start/stop assistance, LLM provider switch, output mode switch, poll interval, and TTS delay.
- Dual LLM support: Anthropic Claude and Google Gemini, with adaptive request throttling and provider fallback.
- Output modes include short alerts for terse, low-latency feedback and sentence mode for richer spoken guidance.
- Text-to-speech integration using Eleven Labs with webhook support and browser-based fallback playback.
- Duplicate/pre-echo suppression through semantic similarity checks before sending TTS messages.
- Backend endpoints for detection, LLM guidance, TTS, similarity evaluation, Eleven Labs webhook handling, health checks, and debug environment state.
- Safe prototyping defaults: broad CORS, fast YOLO inference settings, depth fallback if MiDaS is unavailable, and non-blocking failure handling for depth/LLM/TTS.

## Project Structure

- `hackumass13v2/my-react-app/` - React front-end built with Vite.
- `server/` - FastAPI backend for YOLO-based detection, optional depth estimation, and LLM/TTS integration.
- `server/models/` - Holds the `yolo11n.pt` YOLO model checkpoint.

## What it does

- Streams camera/video input from the browser.
- Sends image frames to the FastAPI server for object detection.
- Displays bounding boxes and detection metadata in real time.
- Uses an LLM endpoint to generate assistive guidance or alerts.
- Supports audio feedback via Eleven Labs.

## Prerequisites

- Node.js and npm/yarn for the front-end.
- Python 3.9+ for the backend.
- `server/models/yolo11n.pt` model checkpoint.
- Optional API keys for Anthropic and Eleven Labs.

## Setup

### 1. Backend

```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Copy your YOLO model checkpoint:

```bash
cp /path/to/yolo11n.pt ./models/yolo11n.pt
```

Create `server/.env` with the following values:

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
ANTHROPIC_MODEL=claude-opus-4-20250514

ELEVEN_LABS_API_KEY=your_eleven_labs_api_key
ELEVEN_LABS_WEBHOOK_SECRET=your_webhook_secret
ELEVEN_LABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
ELEVEN_LABS_WEBHOOK_URL=https://localhost:5173/hackumass/TTSTHING
```

### 2. Front-end

```bash
cd hackumass13v2/my-react-app
npm install
```

## Running the app

### Start the backend

```bash
cd server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Start the front-end

```bash
cd hackumass13v2/my-react-app
npm run dev
```

Then open the Vite URL shown in the terminal (typically `http://localhost:5173`).

## API Endpoints

- `POST /api/detect` - Sends base64 image frames and returns detected objects.
- `POST /api/llm` - Sends detection results to the LLM service and returns guidance text.
- `GET /healthz` - Health check endpoint.

## Notes

- The backend uses YOLO11n for traffic/object detection.
- The React app is configured for fast polling and real-time overlay rendering.
- CORS is enabled broadly for prototyping; restrict origins for production.

## Folder details

- `hackumass13v2/my-react-app/src/components/` - UI components for camera feed, overlay, controls, transcripts, and LLM display.
- `hackumass13v2/my-react-app/src/context/` - React context providers for camera, detection, and LLM state.
- `hackumass13v2/my-react-app/src/services/` - API service helpers.
- `server/main.py` - FastAPI application with YOLO detection, optional depth estimation, and LLM/TTS integration.

## License

This repository does not include a license file. Add one if you want to clarify reuse terms.
