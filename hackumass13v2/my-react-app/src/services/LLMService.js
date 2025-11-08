import { postJson } from "../utils/APIUtils";

const DEFAULT_ENDPOINT = "/api/llm";

export default class LLMService {
  constructor({ endpoint = DEFAULT_ENDPOINT, transformer } = {}) {
    this.endpoint = endpoint;
    this.transformer = transformer;
  }

  async generateGuidance(detections, context = {}, provider = "claude", mode = "sentences") {
    if (!detections || detections.length === 0) {
      return null;
    }

    if (this.transformer) {
      return this.transformer(detections, context);
    }

    const response = await postJson(this.endpoint, {
      detections,
      context,
      provider,
      mode,
    });

    return response.message ?? null;
  }
}
