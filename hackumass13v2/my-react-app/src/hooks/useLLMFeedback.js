import { useEffect, useMemo, useRef, useState } from "react";
import LLMService from "../services/LLMService";
import { throttle } from "../utils/ThrottleUtils";

const DEFAULT_INTERVAL_MS = 2000;

export function useLLMFeedback({
  detections,
  endpoint,
  transformer,
  enabled = true,
  context = {},
  minIntervalMs = DEFAULT_INTERVAL_MS,
  provider = "claude",
} = {}) {
  const llmService = useMemo(
    () => new LLMService({ endpoint, transformer }),
    [endpoint, transformer]
  );
  const [message, setMessage] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const lastSignatureRef = useRef(null);

  const requestGuidance = useMemo(
    () =>
      throttle(async (currentDetections, currentContext, currentProvider) => {
        try {
          setStatus("running");
          const guidance = await llmService.generateGuidance(
            currentDetections,
            currentContext,
            currentProvider
          );
          setMessage(guidance);
          setStatus("idle");
          setError(null);
        } catch (err) {
          setError(err);
          setStatus("error");
        }
      }, minIntervalMs),
    [llmService, minIntervalMs]
  );

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    if (!detections || detections.length === 0) {
      return undefined;
    }

    const signature = JSON.stringify({
      detections,
      context,
    });

    if (signature === lastSignatureRef.current) {
      return undefined;
    }

    lastSignatureRef.current = signature;
    requestGuidance(detections, context, provider);

    return () => {};
  }, [context, detections, enabled, requestGuidance, provider]);

  return {
    message,
    status,
    error,
  };
}
