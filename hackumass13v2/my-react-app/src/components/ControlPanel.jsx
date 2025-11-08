import { useMemo } from "react";
import { useCameraContext } from "../context/CameraContext";

export default function ControlPanel({
  isGuidanceActive,
  onStartGuidance,
  onStopGuidance,
  showOverlay,
  onToggleOverlay,
  modelStatus = "idle",
  isModelReady = false,
}) {
  const { devices, deviceId, setDeviceId, refreshDevices, isEnumerating } = useCameraContext();

  const cameraOptions = useMemo(
    () =>
      devices.map((device) => ({
        value: device.deviceId,
        label: device.label || `Camera ${device.deviceId.slice(-4)}`,
      })),
    [devices]
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        background: "rgba(255, 255, 255, 0.9)",
        padding: "1rem",
        borderRadius: "0.75rem",
        color: "#111827",
        minWidth: "240px",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>Controls</h2>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          onClick={isGuidanceActive ? onStopGuidance : onStartGuidance}
          disabled={!isGuidanceActive && !isModelReady}
          style={{
            flex: 1,
            padding: "0.75rem",
            borderRadius: "0.5rem",
            border: "none",
            background: isGuidanceActive
              ? "#DC2626"
              : !isModelReady
              ? "#9CA3AF"
              : "#2563EB",
            color: "#fff",
            fontWeight: 600,
            cursor: !isGuidanceActive && !isModelReady ? "not-allowed" : "pointer",
            transition: "background 0.2s ease",
          }}
        >
          {isGuidanceActive ? "Stop Guidance" : "Start Guidance"}
        </button>
      </div>

      {!isModelReady && (
        <p
          style={{
            margin: 0,
            fontSize: "0.75rem",
            color: "#6B7280",
          }}
        >
          {modelStatus === "loading"
            ? "Loading YOLOv8 nano model. Start guidance once it is ready."
            : "Model initialization failed. Refresh to retry."}
        </p>
      )}

      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input type="checkbox" checked={showOverlay} onChange={(event) => onToggleOverlay?.(event.target.checked)} />
        <span>Show Bounding Boxes</span>
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <label htmlFor="camera-select" style={{ fontWeight: 500 }}>
          Camera Source
        </label>
        <select
          id="camera-select"
          value={deviceId ?? ""}
          onChange={(event) => setDeviceId(event.target.value)}
          style={{ padding: "0.5rem", borderRadius: "0.5rem", border: "1px solid #D1D5DB" }}
        >
          {cameraOptions.length === 0 && <option value="">No cameras found</option>}
          {cameraOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={refreshDevices}
          style={{
            alignSelf: "flex-start",
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #D1D5DB",
            background: "#F9FAFB",
            cursor: "pointer",
          }}
          disabled={isEnumerating}
        >
          {isEnumerating ? "Refreshing…" : "Refresh Cameras"}
        </button>
      </div>
    </div>
  );
}
