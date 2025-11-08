import { useEffect } from "react";
import { useLLMContext } from "../context/LLMContext";
import { useAudioQueue } from "../hooks/useAudioQueue";

export default function AudioFeedback({
  enabled = true,
  voiceMatcher,
  audioUrlResolver,
  queueOptions,
  renderStatus,
}) {
  const { message } = useLLMContext();
  const audioQueue = useAudioQueue({ ...queueOptions, voiceMatcher });

  useEffect(() => {
    if (!enabled || !message) return;

    const audioItem = audioUrlResolver
      ? { audioUrl: audioUrlResolver(message), text: message }
      : { text: message };
    audioQueue.enqueue(audioItem);
  }, [audioQueue, audioUrlResolver, enabled, message]);

  if (!renderStatus) {
    return null;
  }

  return renderStatus({
    isSpeaking: audioQueue.isSpeaking,
    pending: audioQueue.pending,
    error: audioQueue.error,
    clear: audioQueue.clear,
  });
}
