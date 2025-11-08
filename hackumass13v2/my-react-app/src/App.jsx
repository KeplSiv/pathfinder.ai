import "./App.css";
import { useRef, useState } from "react";
import CameraFeed from "./components/CameraFeed";
import BoundingBoxOverlay from "./components/BoundingBoxOverlay";
import AlertTranscript from "./components/AlertTranscript";
import ControlPanel from "./components/ControlPanel";
import AudioFeedback from "./components/AudioFeedback";
import { CameraProvider, useCameraContext } from "./context/CameraContext";
import {
  DetectionProvider,
  useDetectionContext,
} from "./context/DetectionContext";
import { LLMProvider } from "./context/LLMContext";

function App() {
  return (
    <CameraProvider>
      <GuidanceApp />
    </CameraProvider>
  );
}

function GuidanceApp() {
  const { deviceId } = useCameraContext();
  const videoRef = useRef(null);
  const [guidanceActive, setGuidanceActive] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);

  return (
    <DetectionProvider
      videoRef={videoRef}
      endpoint="/api/detect"
      enabled={guidanceActive}
    >
      <LLMProvider endpoint="/api/llm" enabled={guidanceActive}>
        <Layout>
          <div className="video-section">
            <CameraFeed
              ref={videoRef}
              deviceId={deviceId}
              renderOverlay={({ videoRef: feedRef }) =>
                showOverlay ? <DetectionOverlay videoRef={feedRef} /> : null
              }
            />
          </div>
          <aside className="sidebar">
            <ControlPanel
              isGuidanceActive={guidanceActive}
              onStartGuidance={() => setGuidanceActive(true)}
              onStopGuidance={() => setGuidanceActive(false)}
              showOverlay={showOverlay}
              onToggleOverlay={setShowOverlay}
            />
            <AlertTranscript maxItems={8} />
            <AudioFeedback
              enabled={guidanceActive}
              renderStatus={({ isSpeaking, pending, error }) => (
                <div className="audio-status">
                  <span>{isSpeaking ? "Speaking…" : "Idle"}</span>
                  {pending > 0 && <span>{pending} queued</span>}
                  {error && <span className="error">Audio error</span>}
                </div>
              )}
            />
          </aside>
        </Layout>
      </LLMProvider>
    </DetectionProvider>
  );
}

function DetectionOverlay({ videoRef }) {
  const { detections } = useDetectionContext();
  return <BoundingBoxOverlay videoRef={videoRef} detections={detections} />;
}

function Layout({ children }) {
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Guided Vision Assistant</h1>
        <p>
          Assistive guidance using real-time detection and contextual reasoning.
        </p>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}

export default App;
