import { useDetectionContext } from "../context/DetectionContext";

export default function DetectionResultsPanel({ isGuidanceActive }) {
  const { detections = [], status, error } = useDetectionContext();

  const headline = isGuidanceActive
    ? status === "running"
      ? "Detecting traffic objects…"
      : "Latest detections"
    : "Detection paused";

  const infoMessage = !isGuidanceActive
    ? "Start guidance to run detections with the local PyTorch model server."
    : error
    ? `Detection error: ${
        error.message || "Unable to reach the detection server."
      }`
    : detections.length === 0 && status !== "running"
    ? "No traffic objects detected in the current frame."
    : null;

  return (
    <div className="detection-json-panel">
      <div className="detection-json-header">
        <h3>{headline}</h3>
        <StatusBadge status={status} isGuidanceActive={isGuidanceActive} />
      </div>
      {infoMessage && <p className="detection-json-message">{infoMessage}</p>}
      <pre className="detection-json-output">
        {JSON.stringify(
          detections.map((detection) => ({
            label: detection.label,
            confidence: Number((detection.confidence ?? 0).toFixed(3)),
            bbox: Array.isArray(detection.bbox)
              ? detection.bbox.map((value) => Number(value.toFixed(2)))
              : null,
            updatedAt: detection.updatedAt,
          })),
          null,
          2
        )}
      </pre>
    </div>
  );
}

function StatusBadge({ status, isGuidanceActive }) {
  const label = !isGuidanceActive
    ? "Inactive"
    : status === "running"
    ? "Processing"
    : status === "error"
    ? "Error"
    : "Idle";

  const tone = !isGuidanceActive
    ? "#94A3B8"
    : status === "running"
    ? "#22C55E"
    : status === "error"
    ? "#F97316"
    : "#60A5FA";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        background: "rgba(15, 23, 42, 0.8)",
        color: tone,
        fontSize: "0.75rem",
        padding: "0.35rem 0.75rem",
        borderRadius: "999px",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      ● {label}
    </span>
  );
}

