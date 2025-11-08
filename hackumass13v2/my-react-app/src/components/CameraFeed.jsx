import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { getStreamForDevice } from "../utils/CameraUtils";

const DEFAULT_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  facingMode: "environment",
};

const CameraFeed = forwardRef(function CameraFeed(
  {
    deviceId,
    constraints,
    onStreamStart,
    onError,
    renderOverlay,
    className,
    videoProps = {},
  },
  ref
) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stream, setStream] = useState(null);

  const videoConstraints = useMemo(
    () => ({
      ...DEFAULT_CONSTRAINTS,
      ...(constraints ?? {}),
    }),
    [constraints]
  );

  useImperativeHandle(
    ref,
    () => ({
      get videoElement() {
        return videoRef.current;
      },
      stream,
      isLoading,
      error,
    }),
    [stream, isLoading, error]
  );

  useEffect(() => {
    let cancelled = false;

    async function startStream() {
      setIsLoading(true);
      setError(null);

      try {
        const mediaStream = await getStreamForDevice(deviceId, {
          video: videoConstraints,
        });
        if (cancelled) {
          stopStream(mediaStream);
          return;
        }
        stopStream(streamRef.current);
        streamRef.current = mediaStream;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play().catch(() => {});
        }
        onStreamStart?.(mediaStream);
      } catch (err) {
        if (!cancelled) {
          setError(err);
          onError?.(err);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    startStream();

    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [deviceId, onError, onStreamStart, videoConstraints]);

  return (
    <div className={className} style={{ position: "relative" }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        {...videoProps}
        style={{ width: "100%", height: "auto", ...videoProps.style }}
      />
      {renderOverlay?.({ videoRef, stream, isLoading, error })}
      {isLoading && <StatusBadge label="Starting camera..." />}
      {error && <StatusBadge label="Camera unavailable" variant="error" />}
    </div>
  );
});

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

function StatusBadge({ label, variant = "info" }) {
  const background = variant === "error" ? "rgba(220, 38, 38, 0.85)" : "rgba(30, 64, 175, 0.75)";
  return (
    <div
      style={{
        position: "absolute",
        top: "1rem",
        left: "50%",
        transform: "translateX(-50%)",
        background,
        color: "white",
        padding: "0.5rem 1rem",
        borderRadius: "999px",
        fontSize: "0.875rem",
      }}
    >
      {label}
    </div>
  );
}

export default CameraFeed;
