import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_OPTIONS = {
  rate: 1,
  pitch: 1,
  volume: 1,
  lang: "en-US",
  queue: true,
  delayBetweenMessages: 0, // Delay in milliseconds between messages
};

export function useAudioQueue(options = {}) {
  const { queue, useSpeechSynthesis = true, voiceMatcher, delayBetweenMessages, ...speechOptions } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  const [items, setItems] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [error, setError] = useState(null);
  const audioRef = useRef(null);
  const delayTimeoutRef = useRef(null);

  const enqueue = useCallback(
    (message) => {
      if (!message) return;
      setItems((prev) => {
        if (!queue) {
          return [message];
        }
        return [...prev, message];
      });
    },
    [queue]
  );

  const clear = useCallback(() => {
    setItems([]);
    setIsSpeaking(false);
    setError(null);
    stopPlayback(audioRef.current);
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  useEffect(() => {
    if (!isBrowser()) return undefined;
    if (isSpeaking || isWaiting) return undefined;
    if (items.length === 0) {
      setIsWaiting(false);
      return undefined;
    }

    const [current, ...rest] = items;
    const play = async () => {
      setIsSpeaking(true);
      try {
        if (current.audioUrl) {
          await playAudioUrl(current.audioUrl, audioRef);
        } else if (useSpeechSynthesis) {
          await speakText(current.text ?? String(current), speechOptions, voiceMatcher);
        }
      } catch (err) {
        setError(err);
      } finally {
        setIsSpeaking(false);
        setItems(rest);

        // Add delay before processing next message
        if (delayBetweenMessages > 0 && rest.length > 0) {
          setIsWaiting(true);
          delayTimeoutRef.current = setTimeout(() => {
            setIsWaiting(false);
          }, delayBetweenMessages);
        }
      }
    };

    play();

    return () => {
      if (delayTimeoutRef.current) {
        clearTimeout(delayTimeoutRef.current);
      }
    };
  }, [items, isSpeaking, isWaiting, speechOptions, useSpeechSynthesis, voiceMatcher, delayBetweenMessages]);

  return {
    enqueue,
    clear,
    isSpeaking,
    pending: items.length,
    error,
  };
}

async function speakText(text, options, voiceMatcher) {
  if (!text) return;
  if (!window.speechSynthesis) {
    throw new Error("Speech synthesis not supported");
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options.rate;
  utterance.pitch = options.pitch;
  utterance.volume = options.volume;
  utterance.lang = options.lang;

  const voices = window.speechSynthesis.getVoices();
  if (voiceMatcher && voices.length > 0) {
    utterance.voice = voices.find(voiceMatcher) ?? null;
  }

  return new Promise((resolve, reject) => {
    utterance.onend = resolve;
    utterance.onerror = (event) => reject(event.error || new Error("Speech synthesis failed"));
    window.speechSynthesis.speak(utterance);
  });
}

function playAudioUrl(url, audioRef) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = resolve;
    audio.onerror = () => reject(new Error("Audio playback failed"));
    audio.play().catch(reject);
  });
}

function stopPlayback(audio) {
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
