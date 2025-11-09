# YOLO11n Traffic Detection Server

This FastAPI service loads the local `yolo11n.pt` checkpoint and exposes an HTTP API that the React app can call in real time.

## Setup

1. Create a Python virtual environment (Python 3.9+ recommended).
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy your YOLO nano checkpoint into place:
   ```bash
   cp /path/to/yolo11n.pt ./models/yolo11n.pt
   ```
4. Set up API keys in `.env` file in the `server/` directory:

   ```
   ANTHROPIC_API_KEY=sk-ant-api03-...
   ANTHROPIC_MODEL=claude-opus-4-20250514  # optional

   # Eleven Labs TTS (optional)
   ELEVEN_LABS_API_KEY=your_eleven_labs_api_key
   ELEVEN_LABS_WEBHOOK_SECRET=your_webhook_secret  # optional, for webhook security
   ELEVEN_LABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM  # optional, default voice
   ELEVEN_LABS_WEBHOOK_URL=https://localhost:5173/hackumass/TTSTHING  # webhook endpoint
   ```

## Run

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

You should see a log confirming the model loaded. Health check is available at `http://localhost:8000/healthz`.

## API

### `POST /api/detect`

Detects traffic objects in an image.

```json
{
  "image": "data:image/jpeg;base64,...",
  "confidence": 0.3
}
```

Returns the filtered detections suitable for the React app's overlay and JSON panel.

### `POST /api/llm`

Generates safety guidance from detection results using Claude.

```json
{
  "detections": [
    {
      "label": "car",
      "confidence": 0.85,
      "bbox": [100, 200, 50, 30],
      "updatedAt": 1234567890
    }
  ],
  "context": {},
  "prompt": "optional custom system prompt"
}
```

Returns:

```json
{
  "message": "Safety guidance text from Claude"
}
```

Requires `ANTHROPIC_API_KEY` to be set, otherwise returns 503.
