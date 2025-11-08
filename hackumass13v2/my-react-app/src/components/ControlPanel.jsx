import { useMemo } from "react";
import { useCameraContext } from "../context/CameraContext";

export default function ControlPanel({
  isGuidanceActive,
  onStartGuidance,
  onStopGuidance,
  showOverlay,
  onToggleOverlay,
  llmIntervalMs,
  onChangeLLMInterval,
  ttsDelayMs = 0,
  onChangeTTSDelay,
  llmProvider = "claude",
  onChangeLLMProvider,
}) {
  const { devices, deviceId, setDeviceId, refreshDevices, isEnumerating } =
    useCameraContext();

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
      <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
        Controls
      </h2>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          onClick={isGuidanceActive ? onStopGuidance : onStartGuidance}
          style={{
            flex: 1,
            padding: "0.75rem",
            borderRadius: "0.5rem",
            border: "none",
            background: isGuidanceActive ? "#DC2626" : "#2563EB",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
            transition: "background 0.2s ease",
          }}
        >
          {isGuidanceActive ? "Stop Guidance" : "Start Guidance"}
        </button>
      </div>

      {onChangeLLMProvider && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label htmlFor="llm-provider" style={{ fontWeight: 500 }}>
            LLM Provider
          </label>
          <select
            id="llm-provider"
            value={llmProvider}
            onChange={(event) => onChangeLLMProvider(event.target.value)}
            disabled={isGuidanceActive}
            style={{
              padding: "0.5rem",
              borderRadius: "0.5rem",
              border: "1px solid #D1D5DB",
              background: isGuidanceActive ? "#F3F4F6" : "#fff",
              cursor: isGuidanceActive ? "not-allowed" : "pointer",
              opacity: isGuidanceActive ? 0.6 : 1,
            }}
          >
            <option value="claude">Claude (Anthropic)</option>
            <option value="gemini">Gemini (Google)</option>
          </select>
          {isGuidanceActive && (
            <span style={{ fontSize: "0.75rem", color: "#6B7280", fontStyle: "italic" }}>
              Provider locked while guidance is active
            </span>
          )}
        </div>
      )}

      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="checkbox"
          checked={showOverlay}
          onChange={(event) => onToggleOverlay?.(event.target.checked)}
        />
        <span>Show Bounding Boxes</span>
      </label>

      {typeof llmIntervalMs === "number" && onChangeLLMInterval && (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          <label htmlFor="llm-interval" style={{ fontWeight: 500 }}>
            LLM Update Frequency
          </label>
          <input
            id="llm-interval"
            type="range"
            min={500}
            max={5000}
            step={250}
            value={llmIntervalMs}
            onChange={(event) =>
              onChangeLLMInterval(Number(event.target.value))
            }
          />
          <span style={{ fontSize: "0.8rem", color: "#4B5563" }}>
            Sends detections every {(llmIntervalMs / 1000).toFixed(2)}s
          </span>
        </div>
      )}

      {typeof ttsDelayMs === "number" && onChangeTTSDelay && (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          <label htmlFor="tts-delay" style={{ fontWeight: 500 }}>
            TTS Message Delay
          </label>
          <input
            id="tts-delay"
            type="range"
            min={0}
            max={5000}
            step={100}
            value={ttsDelayMs}
            onChange={(event) => onChangeTTSDelay(Number(event.target.value))}
          />
          <span style={{ fontSize: "0.8rem", color: "#4B5563" }}>
            {ttsDelayMs === 0
              ? "No delay between messages"
              : `Delay: ${(ttsDelayMs / 1000).toFixed(1)}s between messages`}
          </span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <label htmlFor="camera-select" style={{ fontWeight: 500 }}>
          Camera Source
        </label>
        <select
          id="camera-select"
          value={deviceId ?? ""}
          onChange={(event) => setDeviceId(event.target.value)}
          style={{
            padding: "0.5rem",
            borderRadius: "0.5rem",
            border: "1px solid #D1D5DB",
          }}
        >
          {cameraOptions.length === 0 && (
            <option value="">No cameras found</option>
          )}
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
