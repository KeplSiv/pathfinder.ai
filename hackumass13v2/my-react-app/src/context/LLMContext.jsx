import { createContext, useContext } from "react";
import { useLLMFeedback } from "../hooks/useLLMFeedback";
import { useDetectionContext } from "./DetectionContext";

const LLMContext = createContext({
  message: null,
  status: "idle",
  error: null,
});

export function LLMProvider({ children, detections: overrideDetections, provider = "claude", ...options }) {
  const detectionContext = useDetectionContext();
  const detections = overrideDetections ?? detectionContext?.detections ?? [];
  const llmState = useLLMFeedback({ detections, provider, ...options });

  return <LLMContext.Provider value={llmState}>{children}</LLMContext.Provider>;
}

export function useLLMContext() {
  return useContext(LLMContext);
}

export default LLMContext;
