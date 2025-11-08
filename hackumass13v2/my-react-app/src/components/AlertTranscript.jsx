import { useEffect, useMemo, useState } from "react";
import { useLLMContext } from "../context/LLMContext";

export default function AlertTranscript({ messages: controlledMessages, maxItems = 10, title = "Claude Guidance" }) {
  const { message, status, error } = useLLMContext();
  const [internalMessages, setInternalMessages] = useState([]);

  useEffect(() => {
    if (!message) return;
    setInternalMessages((prev) => {
      if (prev[0] === message) return prev;
      const next = [message, ...prev];
      return next.slice(0, maxItems);
    });
  }, [message, maxItems]);

  const messages = useMemo(() => {
    if (controlledMessages) {
      return controlledMessages.slice(0, maxItems);
    }
    return internalMessages;
  }, [controlledMessages, internalMessages, maxItems]);

  const statusText = status === "running" ? "Analyzing..." : status === "error" ? "Error" : null;
  const statusColor = status === "running" ? "#3B82F6" : status === "error" ? "#EF4444" : null;

  return (
    <div
      style={{
        background: "rgba(17, 24, 39, 0.95)",
        color: "#fff",
        padding: "1.25rem",
        borderRadius: "0.75rem",
        maxHeight: "320px",
        overflowY: "auto",
        width: "100%",
        border: "1px solid rgba(59, 130, 246, 0.3)",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, color: "#E5E7EB" }}>{title}</h2>
        {statusText && (
          <span
            style={{
              fontSize: "0.75rem",
              padding: "0.25rem 0.75rem",
              borderRadius: "999px",
              background: statusColor ? `${statusColor}20` : "transparent",
              color: statusColor || "#9CA3AF",
              fontWeight: 500,
            }}
          >
            {statusText}
          </span>
        )}
      </div>
      {error && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.2)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            color: "#FCA5A5",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            marginBottom: "0.5rem",
            fontSize: "0.875rem",
          }}
        >
          {error.message || "Failed to get guidance from Claude"}
        </div>
      )}
      {messages.length === 0 ? (
        <div
          style={{
            color: "#9CA3AF",
            padding: "1rem",
            textAlign: "center",
            fontSize: "0.875rem",
            fontStyle: "italic",
          }}
        >
          {status === "running" ? "Waiting for Claude's analysis..." : "No guidance yet. Start guidance to see Claude's analysis."}
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {messages.map((item, index) => (
            <li
              key={`${item}-${index}`}
              style={{
                background: index === 0 ? "rgba(59, 130, 246, 0.15)" : "rgba(31, 41, 55, 0.6)",
                border: index === 0 ? "1px solid rgba(59, 130, 246, 0.3)" : "1px solid rgba(55, 65, 81, 0.5)",
                padding: "1rem",
                borderRadius: "0.5rem",
                fontSize: "0.9375rem",
                lineHeight: "1.5",
                color: index === 0 ? "#E5E7EB" : "#D1D5DB",
              }}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
