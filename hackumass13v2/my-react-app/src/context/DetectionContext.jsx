import { createContext, useContext } from "react";
import { useDetections } from "../hooks/useDetections";

const DetectionContext = createContext({
  detections: [],
  status: "idle",
  error: null,
  reset: () => {},
});

export function DetectionProvider({ children, videoRef, ...options }) {
  const detectionState = useDetections({ videoRef, ...options });
  return <DetectionContext.Provider value={detectionState}>{children}</DetectionContext.Provider>;
}

export function useDetectionContext() {
  return useContext(DetectionContext);
}

export default DetectionContext;
