import * as ort from "onnxruntime-web";

const HAS_WINDOW = typeof window !== "undefined";
const HAS_DOCUMENT = typeof document !== "undefined";

const INPUT_SIZE = 640;
const NUM_CLASSES = 80;
const DEFAULT_MODEL_URL =
  "https://huggingface.co/onnx-community/yolov8n/resolve/main/yolov8n.onnx?download=1";
const DEFAULT_WASM_URL =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/";

const COCO_CLASSES = [
  "person",
  "bicycle",
  "car",
  "motorcycle",
  "airplane",
  "bus",
  "train",
  "truck",
  "boat",
  "traffic light",
  "fire hydrant",
  "stop sign",
  "parking meter",
  "bench",
  "bird",
  "cat",
  "dog",
  "horse",
  "sheep",
  "cow",
  "elephant",
  "bear",
  "zebra",
  "giraffe",
  "backpack",
  "umbrella",
  "handbag",
  "tie",
  "suitcase",
  "frisbee",
  "skis",
  "snowboard",
  "sports ball",
  "kite",
  "baseball bat",
  "baseball glove",
  "skateboard",
  "surfboard",
  "tennis racket",
  "bottle",
  "wine glass",
  "cup",
  "fork",
  "knife",
  "spoon",
  "bowl",
  "banana",
  "apple",
  "sandwich",
  "orange",
  "broccoli",
  "carrot",
  "hot dog",
  "pizza",
  "donut",
  "cake",
  "chair",
  "couch",
  "potted plant",
  "bed",
  "dining table",
  "toilet",
  "tv",
  "laptop",
  "mouse",
  "remote",
  "keyboard",
  "cell phone",
  "microwave",
  "oven",
  "toaster",
  "sink",
  "refrigerator",
  "book",
  "clock",
  "vase",
  "scissors",
  "teddy bear",
  "hair drier",
  "toothbrush",
];

const TRAFFIC_RELEVANT_CLASSES = new Set([
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
]);

let sharedCanvas = null;
let sharedContext = null;

if (HAS_DOCUMENT && !sharedCanvas) {
  sharedCanvas = document.createElement("canvas");
  sharedContext = sharedCanvas.getContext("2d", { willReadFrequently: true });
}

if (HAS_WINDOW) {
  ort.env.wasm.wasmPaths = DEFAULT_WASM_URL;
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function letterbox(imageBitmap) {
  if (!sharedCanvas || !sharedContext) {
    throw new Error("Canvas not available for preprocessing");
  }

  const { width, height } = imageBitmap;
  const scale = Math.min(INPUT_SIZE / width, INPUT_SIZE / height);
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);
  const dx = Math.round((INPUT_SIZE - newWidth) / 2);
  const dy = Math.round((INPUT_SIZE - newHeight) / 2);

  sharedCanvas.width = INPUT_SIZE;
  sharedCanvas.height = INPUT_SIZE;

  sharedContext.fillStyle = "#000";
  sharedContext.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  sharedContext.drawImage(
    imageBitmap,
    0,
    0,
    width,
    height,
    dx,
    dy,
    newWidth,
    newHeight
  );

  const imageData = sharedContext.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);

  return {
    imageData,
    scale,
    dx,
    dy,
    originalWidth: width,
    originalHeight: height,
  };
}

function imageDataToTensor(imageData) {
  const { data } = imageData;
  const tensorData = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);

  const numPixels = INPUT_SIZE * INPUT_SIZE;
  for (let i = 0; i < numPixels; i += 1) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;

    tensorData[i] = r;
    tensorData[i + numPixels] = g;
    tensorData[i + numPixels * 2] = b;
  }

  return new ort.Tensor("float32", tensorData, [1, 3, INPUT_SIZE, INPUT_SIZE]);
}

async function blobToImageBitmap(blob) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve(img);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = (error) => {
      reject(error);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(blob);
  });
}

function boxesFromOutput({ data, meta, confidenceThreshold, targetClasses }) {
  const stride = 4 + NUM_CLASSES;
  const numDetections = data.length / stride;
  const candidates = [];

  for (let i = 0; i < numDetections; i += 1) {
    const offset = i * stride;
    const cx = data[offset];
    const cy = data[offset + 1];
    const w = data[offset + 2];
    const h = data[offset + 3];

    let bestClass = -1;
    let bestScore = 0;

    for (let c = 0; c < NUM_CLASSES; c += 1) {
      const score = sigmoid(data[offset + 4 + c]);
      if (score > bestScore) {
        bestScore = score;
        bestClass = c;
      }
    }

    if (bestClass === -1 || bestScore < confidenceThreshold) {
      continue;
    }

    const label = COCO_CLASSES[bestClass] ?? `class_${bestClass}`;

    if (targetClasses && !targetClasses.has(label)) {
      continue;
    }

    const {
      scale,
      dx,
      dy,
      originalWidth: frameWidth,
      originalHeight: frameHeight,
    } = meta;

    const boxCx = (cx - dx) / scale;
    const boxCy = (cy - dy) / scale;
    const boxW = w / scale;
    const boxH = h / scale;

    const x1 = Math.max(0, boxCx - boxW / 2);
    const y1 = Math.max(0, boxCy - boxH / 2);
    const x2 = Math.min(frameWidth, boxCx + boxW / 2);
    const y2 = Math.min(frameHeight, boxCy + boxH / 2);

    candidates.push({
      id: `${label}-${i}`,
      label,
      confidence: bestScore,
      bbox: [x1, y1, x2 - x1, y2 - y1],
      box: [x1, y1, x2, y2],
      classIndex: bestClass,
      source: "yolov8n",
    });
  }

  return nonMaxSuppression(candidates, 0.6);
}

function nonMaxSuppression(detections, iouThreshold) {
  const filtered = [];
  const sorted = [...detections].sort(
    (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)
  );

  while (sorted.length > 0) {
    const candidate = sorted.shift();
    filtered.push(candidate);

    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      const other = sorted[i];
      const iou = intersectionOverUnion(candidate.box, other.box);
      if (iou > iouThreshold) {
        sorted.splice(i, 1);
      }
    }
  }

  return filtered;
}

function intersectionOverUnion(boxA, boxB) {
  const [ax1, ay1, ax2, ay2] = boxA;
  const [bx1, by1, bx2, by2] = boxB;

  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  const intersection = Math.max(ix2 - ix1, 0) * Math.max(iy2 - iy1, 0);
  if (intersection === 0) {
    return 0;
  }

  const areaA = Math.max(ax2 - ax1, 0) * Math.max(ay2 - ay1, 0);
  const areaB = Math.max(bx2 - bx1, 0) * Math.max(by2 - by1, 0);

  const union = areaA + areaB - intersection;
  return union <= 0 ? 0 : intersection / union;
}

export function createTrafficClassFilter(customLabels) {
  if (customLabels && customLabels.size > 0) {
    return customLabels;
  }
  return TRAFFIC_RELEVANT_CLASSES;
}

export class YoloV8NanoDetector {
  constructor({
    modelUrl = DEFAULT_MODEL_URL,
    confidenceThreshold = 0.35,
    targetClasses,
  } = {}) {
    if (!HAS_WINDOW) {
      throw new Error("YOLO detector requires a browser environment");
    }

    this.modelUrl = modelUrl;
    this.confidenceThreshold = confidenceThreshold;
    this.targetClasses = targetClasses;
    this._sessionPromise = null;
    this._session = null;
    this._outputName = null;
  }

  async _ensureSession() {
    if (this._session) {
      return this._session;
    }
    if (!this._sessionPromise) {
      this._sessionPromise = ort.InferenceSession.create(this.modelUrl, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      }).then((session) => {
        this._session = session;
        this._outputName = session.outputNames[0];
        return session;
      });
    }
    return this._sessionPromise;
  }

  async detect(imagePayload) {
    if (!imagePayload) {
      return [];
    }

    const blob =
      imagePayload instanceof Blob
        ? imagePayload
        : await (await fetch(imagePayload)).blob();

    const session = await this._ensureSession();
    const bitmap = await blobToImageBitmap(blob);
    const meta = letterbox(bitmap);
    const tensor = imageDataToTensor(meta.imageData);
    const feeds = { [session.inputNames[0]]: tensor };
    const results = await session.run(feeds);
    const output = results[this._outputName];

    if (!output) {
      return [];
    }

    const detections = boxesFromOutput({
      data: output.data,
      meta,
      confidenceThreshold: this.confidenceThreshold,
      targetClasses: this.targetClasses,
    });

    const timestamp = Date.now();
    return detections.map((detection, index) => ({
      ...detection,
      bbox: detection.bbox,
      updatedAt: timestamp,
      index,
    }));
  }

  dispose() {
    this._session = null;
    this._sessionPromise = null;
  }
}

export async function createYoloV8NanoDetector(options = {}) {
  const detector = new YoloV8NanoDetector(options);
  await detector._ensureSession();
  return detector;
}

