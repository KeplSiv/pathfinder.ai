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
    { output = "blob", mimeType = "image/jpeg", quality = 0.6, maxWidth = 640 } = {}
  ) {
    if (
      !videoEl ||
      videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      !this._canvas ||
      !this._context
    ) {
      return null;
    }

    // Resize image to reduce upload size (YOLO works fine on smaller images)
    const originalWidth = videoEl.videoWidth;
    const originalHeight = videoEl.videoHeight;
    
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;
    
    if (maxWidth && originalWidth > maxWidth) {
      const scale = maxWidth / originalWidth;
      targetWidth = maxWidth;
      targetHeight = Math.round(originalHeight * scale);
    }

    this._canvas.width = targetWidth;
    this._canvas.height = targetHeight;
    this._context.drawImage(
      videoEl,
      0,
      0,
      originalWidth,
      originalHeight,
      0,
      0,
      targetWidth,
      targetHeight
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
