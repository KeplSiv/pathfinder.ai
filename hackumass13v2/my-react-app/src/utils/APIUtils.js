const DEFAULT_TIMEOUT_MS = 10000;

// Debug: Log API configuration
const API_BASE_URL = import.meta.env.DEV
  ? "" // Empty in dev - uses Vite proxy
  : "http://144.202.0.231:8000"; // Production URL

console.log("[API Debug] Environment:", import.meta.env.MODE);
console.log("[API Debug] API Base URL:", API_BASE_URL || "(using Vite proxy)");
console.log(
  "[API Debug] Full backend URL:",
  API_BASE_URL || "http://localhost:5173 → http://144.202.0.231:8000 (proxied)"
);

export async function fetchWithTimeout(resource, options = {}) {
  const { timeout = DEFAULT_TIMEOUT_MS, ...rest } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Build full URL
  const fullUrl = resource.startsWith("http")
    ? resource
    : `${API_BASE_URL}${resource}`;

  // Debug logging
  console.log(`[API Debug] Making request:`, {
    method: rest.method || "GET",
    url: fullUrl,
    originalResource: resource,
    isProxied: import.meta.env.DEV && resource.startsWith("/api"),
    timestamp: new Date().toISOString(),
  });

  try {
    const response = await fetch(fullUrl, {
      ...rest,
      signal: controller.signal,
    });

    // Debug response
    console.log(`[API Debug] Response received:`, {
      url: fullUrl,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
    });

    if (!response.ok) {
      const error = new Error(`Request failed with status ${response.status}`);
      error.status = response.status;
      error.body = await safeJson(response);
      console.error(`[API Debug] Request failed:`, {
        url: fullUrl,
        status: response.status,
        error: error.body,
      });
      throw error;
    }

    return response;
  } catch (error) {
    console.error(`[API Debug] Request error:`, {
      url: fullUrl,
      error: error.message,
      type: error.name,
    });
    throw error;
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
  // Debug logging for POST requests
  const bodyPreview =
    typeof body === "object"
      ? JSON.stringify(body).substring(0, 200) +
        (JSON.stringify(body).length > 200 ? "..." : "")
      : body;

  console.log(`[API Debug] POST request:`, {
    url,
    bodyPreview,
    bodySize:
      typeof body === "object"
        ? JSON.stringify(body).length
        : body?.length || 0,
  });

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body: JSON.stringify(body),
    ...options,
  });

  const jsonData = await response.json();

  console.log(`[API Debug] POST response:`, {
    url,
    status: response.status,
    dataPreview:
      JSON.stringify(jsonData).substring(0, 200) +
      (JSON.stringify(jsonData).length > 200 ? "..." : ""),
  });

  return jsonData;
}
