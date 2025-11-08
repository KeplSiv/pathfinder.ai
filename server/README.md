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

## Run

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

You should see a log confirming the model loaded. Health check is available at `http://localhost:8000/healthz`.

## API

`POST /detect`

```json
{
  "image": "data:image/jpeg;base64,...",
  "confidence": 0.3
}
```

Returns the filtered detections suitable for the React app’s overlay and JSON panel.

