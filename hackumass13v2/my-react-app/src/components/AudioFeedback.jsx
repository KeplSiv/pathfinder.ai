import { useEffect, useRef } from "react";
import { useLLMContext } from "../context/LLMContext";
import { useAudioQueue } from "../hooks/useAudioQueue";
import TTSService from "../services/TTSService";
import SimilarityService from "../services/SimilarityService";

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
  const similarityService = useRef(new SimilarityService());
  const recentMessagesRef = useRef([]); // Store last 5 messages for similarity check
  const MAX_RECENT_MESSAGES = 5;

  useEffect(() => {
    if (!enabled || !message) return;

    const processMessage = async () => {
      // Check similarity with recent messages before sending to TTS
      const previousTexts = recentMessagesRef.current;
      const similarityResult = await similarityService.current.checkSimilarity(
        message,
        previousTexts
      );

      // Only send to TTS if message is meaningfully different
      if (similarityResult.isSimilar) {
        console.log(
          `Skipping TTS - message too similar (similarity: ${similarityResult.maxSimilarity.toFixed(2)})`
        );
        return;
      }

      // Add to recent messages (keep last 5)
      recentMessagesRef.current = [message, ...previousTexts].slice(0, MAX_RECENT_MESSAGES);

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
    };

    processMessage();
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
