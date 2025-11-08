const DEFAULT_TIMEOUT_MS = 10000;

export async function fetchWithTimeout(resource, options = {}) {
  const { timeout = DEFAULT_TIMEOUT_MS, ...rest } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(resource, { ...rest, signal: controller.signal });
    if (!response.ok) {
      const error = new Error(`Request failed with status ${response.status}`);
      error.status = response.status;
      error.body = await safeJson(response);
      throw error;
    }
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function safeJson(response) {
  try {
    return await response.clone().json();
  } catch (err) {
    return null;
  }
}

export async function postJson(url, body, options = {}) {
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body: JSON.stringify(body),
    ...options,
  });

  return response.json();
}
