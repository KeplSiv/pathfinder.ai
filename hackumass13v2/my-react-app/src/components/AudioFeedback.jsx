import { useEffect } from "react";
import { useLLMContext } from "../context/LLMContext";
import { useAudioQueue } from "../hooks/useAudioQueue";
import TTSService from "../services/TTSService";

export default function AudioFeedback({
  enabled = true,
  voiceMatcher,
  audioUrlResolver,
  queueOptions,
  renderStatus,
  useElevenLabs = false,
}) {
  const { message } = useLLMContext();
  const audioQueue = useAudioQueue({ ...queueOptions, voiceMatcher });
  const ttsService = useElevenLabs ? new TTSService() : null;

  useEffect(() => {
    if (!enabled || !message) return;

    if (useElevenLabs && ttsService) {
      // Send to Eleven Labs TTS
      ttsService.speak(message).then((result) => {
        if (result.success) {
          // Eleven Labs will send audio via webhook
          // For now, we'll also queue it for fallback
          audioQueue.enqueue({ text: message });
        } else {
          // Fallback to speech synthesis
          audioQueue.enqueue({ text: message });
        }
      });
    } else {
      const audioItem = audioUrlResolver
        ? { audioUrl: audioUrlResolver(message), text: message }
        : { text: message };
      audioQueue.enqueue(audioItem);
    }
  }, [audioQueue, audioUrlResolver, enabled, message, useElevenLabs, ttsService]);

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
