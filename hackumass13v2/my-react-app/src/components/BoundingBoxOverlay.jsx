import { useEffect, useMemo, useState } from "react";

const DEFAULT_COLOR = "#10B981";

function computeScale(videoEl) {
  if (!videoEl) {
    return { scaleX: 1, scaleY: 1 };
  }
  const { videoWidth, videoHeight, clientWidth, clientHeight } = videoEl;
  return {
    scaleX: clientWidth / (videoWidth || clientWidth || 1),
    scaleY: clientHeight / (videoHeight || clientHeight || 1),
  };
}

export default function BoundingBoxOverlay({ videoRef, detections = [], color = DEFAULT_COLOR }) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, scaleX: 1, scaleY: 1 });

  useEffect(() => {
    const videoEl = videoRef?.current ?? videoRef;
    if (!videoEl) return undefined;

    function updateDimensions() {
      const rect = videoEl.getBoundingClientRect();
      const { scaleX, scaleY } = computeScale(videoEl);
      setDimensions({
        width: rect.width,
        height: rect.height,
        scaleX,
        scaleY,
      });
    }

    updateDimensions();
    const observer = new ResizeObserver(() => updateDimensions());
    observer.observe(videoEl);

    return () => observer.disconnect();
  }, [videoRef]);

  const boxes = useMemo(() => {
    return detections.map((detection, index) => {
      const [x, y, w, h] = detection.bbox ?? [];
      return {
        id: detection.id ?? `${detection.label}-${index}`,
        label: detection.label,
        confidence: detection.confidence,
        x: (x ?? 0) * dimensions.scaleX,
        y: (y ?? 0) * dimensions.scaleY,
        width: (w ?? 0) * dimensions.scaleX,
        height: (h ?? 0) * dimensions.scaleY,
      };
    });
  }, [detections, dimensions.scaleX, dimensions.scaleY]);

  if (!detections || detections.length === 0) {
    return null;
  }

  return (
    <svg
      width={dimensions.width}
      height={dimensions.height}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
      }}
    >
      {boxes.map((box) => (
        <g key={box.id}>
          <rect
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            fill="none"
            stroke={color}
            strokeWidth="2"
            rx="4"
            ry="4"
          />
          <text
            x={box.x + 4}
            y={Math.max(box.y - 6, 12)}
            fill="#fff"
            fontSize="12"
            fontWeight="600"
            stroke="#111827"
            strokeWidth="0.5"
            paintOrder="stroke"
          >
            {formatLabel(box.label, box.confidence)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function formatLabel(label, confidence) {
  if (!label) return "";
  if (typeof confidence === "number") {
    return `${label} ${(confidence * 100).toFixed(0)}%`;
  }
  return label;
}
