import { postJson } from "../utils/APIUtils";

const DEFAULT_ENDPOINT = "/api/detect";

export default class DetectionService {
  constructor({ endpoint = DEFAULT_ENDPOINT, localDetector } = {}) {
    this.endpoint = endpoint;
    this.localDetector = localDetector;
  }

  async detect(imagePayload) {
    if (this.localDetector) {
      return this.localDetector(imagePayload);
    }

    if (!imagePayload) {
      return [];
    }

    const payload = await normalizePayload(imagePayload);
    // Keep depth estimation enabled (needed for relative_depth in detections)
    payload.skip_depth = false;
    
    // Optimize timeout based on server location
    // Localhost: faster timeout (15s) since no network latency
    // Remote: longer timeout (45s) for network + processing
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const timeout = isLocalhost ? 15000 : 45000;
    
    const response = await postJson(this.endpoint, payload, { timeout });
    return response.detections ?? [];
  }
}

async function normalizePayload(imagePayload) {
  if (typeof imagePayload === "string") {
    return { image: imagePayload };
  }

  if (imagePayload instanceof Blob) {
    const buffer = await imagePayload.arrayBuffer();
    const base64 = bufferToBase64(buffer);
    return { image: `data:${imagePayload.type};base64,${base64}` };
  }

  return imagePayload;
}

function bufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;

  for (let i = 0; i < len; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}
