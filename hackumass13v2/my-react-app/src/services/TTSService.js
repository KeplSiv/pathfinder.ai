import { postJson } from "../utils/APIUtils";

const DEFAULT_ENDPOINT = "/api/tts";

export default class TTSService {
  constructor({ endpoint = DEFAULT_ENDPOINT } = {}) {
    this.endpoint = endpoint;
  }

  async speak(text, voiceId = null) {
    if (!text || !text.trim()) {
      return { success: false, error: "Text is required" };
    }

    try {
      const response = await postJson(this.endpoint, {
        text: text.trim(),
        voice_id: voiceId,
      });
      return { success: true, ...response };
    } catch (error) {
      return {
        success: false,
        error: error.message || "Failed to generate speech",
      };
    }
  }
}

