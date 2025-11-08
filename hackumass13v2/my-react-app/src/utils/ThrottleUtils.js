export function throttle(fn, wait) {
  let lastCall = 0;
  let timeoutId;
  let lastArgs;

  const trailingCall = () => {
    timeoutId = undefined;
    lastCall = Date.now();
    fn(...lastArgs);
    lastArgs = undefined;
  };

  return (...args) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    lastArgs = args;

    if (timeSinceLastCall >= wait) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      trailingCall();
    } else if (!timeoutId) {
      timeoutId = setTimeout(trailingCall, wait - timeSinceLastCall);
    }
  };
}
