import { useEffect, useMemo, useState } from "react";
import { useLLMContext } from "../context/LLMContext";

export default function AlertTranscript({ messages: controlledMessages, maxItems = 10, title = "Guidance" }) {
  const { message } = useLLMContext();
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

  if (messages.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        background: "rgba(17, 24, 39, 0.8)",
        color: "#fff",
        padding: "1rem",
        borderRadius: "0.75rem",
        maxHeight: "240px",
        overflowY: "auto",
        width: "100%",
      }}
    >
      <h2 style={{ margin: "0 0 0.75rem", fontSize: "1rem", fontWeight: 600 }}>{title}</h2>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {messages.map((item, index) => (
          <li key={`${item}-${index}`} style={{ background: "rgba(31, 41, 55, 0.6)", padding: "0.75rem", borderRadius: "0.5rem" }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
