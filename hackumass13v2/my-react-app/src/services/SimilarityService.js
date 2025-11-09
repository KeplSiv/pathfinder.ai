import { postJson } from "../utils/APIUtils";

const DEFAULT_ENDPOINT = "/api/similarity";

export default class SimilarityService {
  constructor({ endpoint = DEFAULT_ENDPOINT } = {}) {
    this.endpoint = endpoint;
  }

  async checkSimilarity(text, previousTexts = []) {
    if (!text || !text.trim()) {
      return { isSimilar: false, maxSimilarity: 0 };
    }

    try {
      const response = await postJson(this.endpoint, {
        text: text.trim(),
        previous_texts: previousTexts.filter(t => t && t.trim()),
      });
      return {
        isSimilar: response.is_similar || false,
        maxSimilarity: response.max_similarity || 0,
        threshold: response.threshold || 0.85,
      };
    } catch (error) {
      // If similarity check fails, allow TTS (fail open)
      console.warn("Similarity check failed, allowing TTS:", error);
      return { isSimilar: false, maxSimilarity: 0 };
    }
  }
}

