import { useDetectionContext } from "../context/DetectionContext";

export default function DetectionResultsPanel({
  modelStatus,
  modelError,
  isGuidanceActive,
}) {
  const { detections = [], status, error } = useDetectionContext();

  const headline =
    modelStatus === "loading"
      ? "Loading YOLOv8 nano model…"
      : modelStatus === "error"
      ? "Model unavailable"
      : isGuidanceActive
      ? status === "running"
        ? "Detecting traffic objects…"
        : "Latest detections"
      : "Detection paused";

  const infoMessage =
    modelStatus === "error"
      ? modelError?.message ?? "Unable to initialize detector."
      : error
      ? error.message
      : detections.length === 0 && isGuidanceActive && modelStatus === "ready"
      ? "No traffic objects detected in the current frame."
      : null;

  return (
    <div className="detection-json-panel">
      <div className="detection-json-header">
        <h3>{headline}</h3>
        {isGuidanceActive && (
          <StatusBadge status={status} modelStatus={modelStatus} />
        )}
      </div>
      {infoMessage && <p className="detection-json-message">{infoMessage}</p>}
      <pre className="detection-json-output">
        {JSON.stringify(
          detections.map((detection) => ({
            label: detection.label,
            confidence: Number((detection.confidence ?? 0).toFixed(3)),
            bbox: detection.bbox?.map((value) => Number(value.toFixed(2))),
            updatedAt: detection.updatedAt,
          })),
          null,
          2
        )}
      </pre>
    </div>
  );
}

function StatusBadge({ status, modelStatus }) {
  const label =
    modelStatus === "loading"
      ? "Loading model"
      : status === "running"
      ? "Processing"
      : "Idle";

  const tone =
    modelStatus === "loading"
      ? "#F97316"
      : status === "running"
      ? "#22C55E"
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

