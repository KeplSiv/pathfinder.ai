const DEFAULT_SAMPLE_INTERVAL_MS = 1000;

export default class FrameSampler {
  constructor({ sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS } = {}) {
    this.sampleIntervalMs = sampleIntervalMs;
    this._canvas =
      typeof document !== "undefined" ? document.createElement("canvas") : null;
    this._context = this._canvas
      ? this._canvas.getContext("2d", { willReadFrequently: true })
      : null;
    this._lastSampleAt = 0;
  }

  shouldSample(
    now = typeof performance !== "undefined" ? performance.now() : Date.now()
  ) {
    return now - this._lastSampleAt >= this.sampleIntervalMs;
  }

  async grabFrame(
    videoEl,
    { output = "blob", mimeType = "image/jpeg", quality = 0.8 } = {}
  ) {
    if (
      !videoEl ||
      videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      !this._canvas ||
      !this._context
    ) {
      return null;
    }

    this._canvas.width = videoEl.videoWidth;
    this._canvas.height = videoEl.videoHeight;
    this._context.drawImage(
      videoEl,
      0,
      0,
      videoEl.videoWidth,
      videoEl.videoHeight
    );

    this._lastSampleAt =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    if (output === "base64") {
      return this._canvas.toDataURL(mimeType, quality);
    }

    return new Promise((resolve) => {
      this._canvas.toBlob((blob) => resolve(blob), mimeType, quality);
    });
  }
}
