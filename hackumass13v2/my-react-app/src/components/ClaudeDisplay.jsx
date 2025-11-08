import { useLLMContext } from "../context/LLMContext";

export default function ClaudeDisplay() {
  const { message, status, error, provider = "claude" } = useLLMContext();

  const shouldShow = message || status === "running" || error;
  
  if (!shouldShow) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        top: "1rem",
        left: "50%",
        transform: "translateX(-50%)",
        maxWidth: "90%",
        width: "max-content",
        zIndex: 1000,
        background: status === "error"
          ? "rgba(239, 68, 68, 0.95)"
          : message
          ? "rgba(59, 130, 246, 0.95)"
          : "rgba(17, 24, 39, 0.95)",
        color: "#fff",
        padding: "1rem 1.5rem",
        borderRadius: "0.75rem",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
        border: `2px solid ${
          status === "error" ? "rgba(239, 68, 68, 1)" : message ? "rgba(59, 130, 246, 1)" : "rgba(156, 163, 175, 1)"
        }`,
        backdropFilter: "blur(8px)",
        transition: "all 0.3s ease-in",
        opacity: message || status === "running" || error ? 1 : 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div
          style={{
            fontSize: "1.25rem",
            fontWeight: 700,
            color: "#fff",
            textShadow: "0 2px 4px rgba(0, 0, 0, 0.3)",
          }}
        >
          {status === "error" ? "⚠️" : message ? "🤖" : "⏳"}
        </div>
        <div style={{ flex: 1 }}>
          {error ? (
            <div>
              <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
                {provider === "gemini" ? "Gemini" : "Claude"} Error
              </div>
              <div style={{ fontSize: "0.875rem", opacity: 0.95, lineHeight: "1.5", marginBottom: "0.25rem" }}>
                {error.message || "Failed to get guidance"}
              </div>
              {provider === "gemini" && error.status === 429 && (
                <div style={{ fontSize: "0.75rem", opacity: 0.85, marginTop: "0.5rem", fontStyle: "italic" }}>
                  💡 Tip: Gemini free tier allows 10 requests/minute. Consider switching to Claude for higher limits.
                </div>
              )}
              {error.status && (
                <div style={{ fontSize: "0.7rem", opacity: 0.7, marginTop: "0.25rem" }}>
                  Status: {error.status}
                </div>
              )}
            </div>
          ) : message ? (
            <div>
              <div style={{ fontWeight: 600, marginBottom: "0.25rem", fontSize: "0.875rem", opacity: 0.9 }}>
                {provider === "gemini" ? "Gemini" : "Claude"} Guidance
              </div>
              <div style={{ fontSize: "1rem", lineHeight: "1.5", fontWeight: 500 }}>{message}</div>
            </div>
          ) : (
            <div style={{ fontSize: "0.9375rem", opacity: 0.9 }}>
              Analyzing scene with {provider === "gemini" ? "Gemini" : "Claude"}...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

