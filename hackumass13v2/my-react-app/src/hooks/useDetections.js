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
  const lastDetectionsSignatureRef = useRef(null);

  // Normalize detections for comparison - track object types, counts, and depth categories
  // This ensures new objects entering the frame trigger updates
  const normalizeDetections = useCallback((dets) => {
    if (!dets || dets.length === 0) return null;
    
    // Group by label and count, track depth categories
    const grouped = {};
    dets.forEach((d) => {
      const key = d.label;
      if (!grouped[key]) {
        grouped[key] = {
          label: key,
          count: 0,
          // Track depth ranges (close/mid/far) instead of exact values
          depthCategory: d.relative_depth !== null && d.relative_depth !== undefined
            ? (d.relative_depth < 0.33 ? 'close' : d.relative_depth < 0.66 ? 'mid' : 'far')
            : null,
          minConfidence: d.confidence,
        };
      }
      grouped[key].count += 1;
      grouped[key].minConfidence = Math.min(grouped[key].minConfidence, d.confidence);
    });
    
    // Convert to sorted array for consistent comparison
    // Sort by label first, then by count (so new objects are detected)
    const normalized = Object.values(grouped)
      .sort((a, b) => {
        if (a.label !== b.label) return a.label.localeCompare(b.label);
        return b.minConfidence - a.minConfidence;
      })
      .map((g) => ({
        label: g.label,
        count: g.count,
        depthCategory: g.depthCategory,
        confidence: Math.round(g.minConfidence * 100) / 100,
      }));
    
    return JSON.stringify(normalized);
  }, []);

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
        
        // Only update if detections actually changed (ignore timestamp changes)
        const newSignature = normalizeDetections(results);
        if (newSignature !== lastDetectionsSignatureRef.current) {
          lastDetectionsSignatureRef.current = newSignature;
          setDetections(results);
        }
        
        setError(null);
        setStatus("idle");
      } catch (err) {
        setError(err);
        setStatus("error");
      }
    },
    [detectionService, normalizeDetections]
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
