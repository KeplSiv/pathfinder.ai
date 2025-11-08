export async function getVideoDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    throw new Error("Media devices API not supported");
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "videoinput");
}

export async function getStreamForDevice(deviceId, constraints = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("User media API not supported");
  }

  const streamConstraints = {
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      ...constraints.video,
    },
    audio: false,
    ...constraints,
  };

  return navigator.mediaDevices.getUserMedia(streamConstraints);
}
