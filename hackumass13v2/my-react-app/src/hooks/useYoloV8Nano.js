import { useEffect, useMemo, useState } from "react";
import {
  createTrafficClassFilter,
  createYoloV8NanoDetector,
} from "../models/YoloV8Nano";

const DEFAULT_MODEL_URL =
  "https://huggingface.co/onnx-community/yolov8n/resolve/main/yolov8n.onnx?download=1";

export function useYoloV8Nano({
  modelUrl = DEFAULT_MODEL_URL,
  confidenceThreshold = 0.35,
  targetLabels,
} = {}) {
  const [detector, setDetector] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const targetClasses = useMemo(
    () => createTrafficClassFilter(targetLabels),
    [targetLabels]
  );

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);

    createYoloV8NanoDetector({
      modelUrl,
      confidenceThreshold,
      targetClasses,
    })
      .then((instance) => {
        if (cancelled) {
          instance?.dispose?.();
          return;
        }
        setDetector(() => instance.detect.bind(instance));
        setStatus("ready");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [modelUrl, confidenceThreshold, targetClasses]);

  return {
    detector,
    status,
    error,
    ready: status === "ready" && typeof detector === "function",
  };
}

