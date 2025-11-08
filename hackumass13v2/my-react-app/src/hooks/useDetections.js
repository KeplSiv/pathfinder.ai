import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DetectionService from "../services/DetectionService";
import FrameSampler from "../utils/FrameSampler";
import { throttle } from "../utils/ThrottleUtils";

const DEFAULT_POLL_INTERVAL_MS = 1500;

export function useDetections({
  videoRef,
  endpoint,
  localDetector,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  enabled = true,
} = {}) {
  const detectionService = useMemo(
    () => new DetectionService({ endpoint, localDetector }),
    [endpoint, localDetector]
  );

  const frameSamplerRef = useRef(new FrameSampler());
  const [detections, setDetections] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const processFrame = useCallback(
    async (videoEl) => {
      if (!videoEl) return;
      try {
        const sampler = frameSamplerRef.current;
        if (!sampler.shouldSample()) return;

        const frame = await sampler.grabFrame(videoEl, { output: "blob" });
        if (!frame) return;

        setStatus("running");
        const results = await detectionService.detect(frame);
        setDetections(results);
        setError(null);
        setStatus("idle");
      } catch (err) {
        setError(err);
        setStatus("error");
      }
    },
    [detectionService]
  );

  const throttledProcessFrame = useMemo(
    () => throttle(processFrame, pollIntervalMs),
    [processFrame, pollIntervalMs]
  );

  useEffect(() => {
    if (!enabled) return undefined;

    const intervalId = setInterval(() => {
      const refCandidate = videoRef?.current ?? videoRef;
      const videoEl =
        refCandidate?.videoElement ??
        refCandidate?.current ??
        refCandidate;

      const canProcess =
        (typeof HTMLVideoElement !== "undefined" &&
          videoEl instanceof HTMLVideoElement) ||
        videoEl?.tagName === "VIDEO";

      if (canProcess) {
        throttledProcessFrame(videoEl);
      }
    }, pollIntervalMs);

    return () => clearInterval(intervalId);
  }, [enabled, pollIntervalMs, throttledProcessFrame, videoRef]);

  const reset = useCallback(() => {
    setDetections([]);
    setError(null);
    setStatus("idle");
  }, []);

  return {
    detections,
    status,
    error,
    reset,
  };
}
