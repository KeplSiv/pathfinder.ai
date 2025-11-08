import { createContext, useContext } from "react";
import { useLLMFeedback } from "../hooks/useLLMFeedback";
import { useDetectionContext } from "./DetectionContext";

const LLMContext = createContext({
  message: null,
  status: "idle",
  error: null,
  provider: "claude",
});

export function LLMProvider({
  children,
  detections: overrideDetections,
  provider = "claude",
  mode = "sentences",
  ...options
}) {
  const detectionContext = useDetectionContext();
  const detections = overrideDetections ?? detectionContext?.detections ?? [];
  const llmState = useLLMFeedback({ detections, provider, mode, ...options });

  return (
    <LLMContext.Provider value={{ ...llmState, provider }}>
      {children}
    </LLMContext.Provider>
  );
}

export function useLLMContext() {
  return useContext(LLMContext);
}

export default LLMContext;
