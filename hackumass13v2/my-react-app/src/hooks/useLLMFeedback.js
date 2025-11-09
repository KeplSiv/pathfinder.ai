import { useEffect, useMemo, useRef, useState } from "react";
import LLMService from "../services/LLMService";
import { throttle } from "../utils/ThrottleUtils";

const DEFAULT_INTERVAL_MS = 300; // Reduced for near real-time responses
// Gemini free tier: 10 requests/minute = 6000ms minimum between requests
const GEMINI_MIN_INTERVAL_MS = 6000;

export function useLLMFeedback({
  detections,
  endpoint,
  transformer,
  enabled = true,
  context = {},
  minIntervalMs = DEFAULT_INTERVAL_MS,
  provider = "claude",
  mode = "sentences",
} = {}) {
  // Enforce minimum interval for Gemini to avoid rate limits
  const effectiveInterval = provider === "gemini" 
    ? Math.max(minIntervalMs, GEMINI_MIN_INTERVAL_MS)
    : minIntervalMs;
  const llmService = useMemo(
    () => new LLMService({ endpoint, transformer }),
    [endpoint, transformer]
  );
  const [message, setMessage] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const lastSignatureRef = useRef(null);
  const lastChangeTimeRef = useRef(0);
  const stabilityTimeoutRef = useRef(null);
  const recentMessagesRef = useRef([]);
  const pendingRequestRef = useRef(false);

  // Normalize detections - ignore bbox positions, only care about object types and counts
  const normalizeDetections = (dets) => {
    if (!dets || dets.length === 0) return null;
    
    // Group by label and count, ignore exact positions
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
  };

  // Check if message is similar to recent messages (avoid repetition)
  const isSimilarToRecent = (newMessage) => {
    if (!newMessage || newMessage.trim().length === 0) return true;
    
    const normalized = newMessage.toLowerCase().trim();
    const recent = recentMessagesRef.current;
    
    // Check if this message is very similar to any recent message
    for (const recentMsg of recent) {
      const recentNormalized = recentMsg.toLowerCase().trim();
      // If messages are identical or one contains the other, consider them similar
      if (normalized === recentNormalized || 
          normalized.includes(recentNormalized) || 
          recentNormalized.includes(normalized)) {
        return true;
      }
      
      // Check word overlap (if >70% words match, consider similar)
      const newWords = new Set(normalized.split(/\s+/));
      const recentWords = new Set(recentNormalized.split(/\s+/));
      const intersection = new Set([...newWords].filter(w => recentWords.has(w)));
      const union = new Set([...newWords, ...recentWords]);
      if (union.size > 0 && intersection.size / union.size > 0.7) {
        return true;
      }
    }
    
    return false;
  };

  const requestGuidance = useMemo(
    () =>
      throttle(async (currentDetections, currentContext, currentProvider, currentMode) => {
        if (pendingRequestRef.current) return; // Prevent concurrent requests
        pendingRequestRef.current = true;
        
        try {
          setStatus("running");
          const guidance = await llmService.generateGuidance(
            currentDetections,
            currentContext,
            currentProvider,
            currentMode
          );
          
          // Only update if message is meaningfully different from recent ones
          if (guidance && !isSimilarToRecent(guidance)) {
            setMessage(guidance);
            // Track recent messages (keep last 3)
            recentMessagesRef.current = [guidance, ...recentMessagesRef.current].slice(0, 3);
          }
          
          setStatus("idle");
          setError(null);
        } catch (err) {
          // Extract detailed error message from API response
          let errorMessage = err.message || "Failed to get guidance";
          if (err.body && err.body.detail) {
            errorMessage = err.body.detail;
          } else if (err.status === 429) {
            errorMessage = "Rate limit exceeded. Please wait or switch to Claude.";
            if (err.body && err.body.detail) {
              errorMessage = err.body.detail;
            }
          } else if (err.status === 502 || err.status === 503) {
            errorMessage = err.body?.detail || "Service unavailable. Please check your API key.";
          }
          setError({ ...err, message: errorMessage });
          setStatus("error");
        } finally {
          pendingRequestRef.current = false;
        }
      }, effectiveInterval),
    [llmService, effectiveInterval]
  );

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    if (!detections || detections.length === 0) {
      return undefined;
    }

    // Compare normalized detections (ignoring timestamps, bbox positions) and context
    const normalizedDets = normalizeDetections(detections);
    const signature = JSON.stringify({
      detections: normalizedDets,
      context,
      provider,
      mode,
    });

    if (signature === lastSignatureRef.current) {
      return undefined;
    }

    // Check if this is a significant change (new objects appeared or objects disappeared)
    const prevSignature = lastSignatureRef.current;
    let isSignificantChange = true;
    
    if (prevSignature) {
      try {
        const prevData = JSON.parse(prevSignature);
        const currData = JSON.parse(signature);
        
        // Compare detection counts - if counts changed, it's significant
        const prevCounts = {};
        const currCounts = {};
        
        // Parse detections (they're already JSON strings in the signature)
        const prevDets = prevData.detections ? (typeof prevData.detections === 'string' ? JSON.parse(prevData.detections) : prevData.detections) : [];
        const currDets = currData.detections ? (typeof currData.detections === 'string' ? JSON.parse(currData.detections) : currData.detections) : [];
        
        prevDets.forEach((d) => {
          prevCounts[d.label] = (prevCounts[d.label] || 0) + (d.count || 1);
        });
        
        currDets.forEach((d) => {
          currCounts[d.label] = (currCounts[d.label] || 0) + (d.count || 1);
        });
        
        // Check if any object type count changed or new objects appeared
        const allLabels = new Set([...Object.keys(prevCounts), ...Object.keys(currCounts)]);
        isSignificantChange = Array.from(allLabels).some((label) => {
          const prevCount = prevCounts[label] || 0;
          const currCount = currCounts[label] || 0;
          return prevCount !== currCount; // Count changed = significant
        });
      } catch (e) {
        // If parsing fails, treat as significant change (safer to trigger)
        isSignificantChange = true;
      }
    }

    // For significant changes (new objects), trigger immediately for real-time feel
    // For minor changes, use minimal delay to prevent jitter
    const now = Date.now();
    const timeSinceLastChange = now - lastChangeTimeRef.current;
    const STABILITY_DELAY_MS = isSignificantChange ? 50 : 150; // Very fast - near real-time

    // Clear any pending stability timeout
    if (stabilityTimeoutRef.current) {
      clearTimeout(stabilityTimeoutRef.current);
      stabilityTimeoutRef.current = null;
    }

    // For significant changes, trigger almost immediately
    // For minor changes, use minimal delay
    if (isSignificantChange && timeSinceLastChange >= 50) {
      // Significant change and enough time passed - trigger immediately
      lastSignatureRef.current = signature;
      lastChangeTimeRef.current = Date.now();
      requestGuidance(detections, context, provider, mode);
    } else if (timeSinceLastChange < STABILITY_DELAY_MS) {
      // Wait for minimal stability
      stabilityTimeoutRef.current = setTimeout(() => {
        lastSignatureRef.current = signature;
        lastChangeTimeRef.current = Date.now();
        requestGuidance(detections, context, provider, mode);
        stabilityTimeoutRef.current = null;
      }, STABILITY_DELAY_MS - timeSinceLastChange);
    } else {
      // Change is stable, trigger immediately
      lastSignatureRef.current = signature;
      lastChangeTimeRef.current = Date.now();
      requestGuidance(detections, context, provider, mode);
    }

    return () => {
      if (stabilityTimeoutRef.current) {
        clearTimeout(stabilityTimeoutRef.current);
        stabilityTimeoutRef.current = null;
      }
    };
  }, [context, detections, enabled, requestGuidance, provider, mode]);

  return {
    message,
    status,
    error,
  };
}
