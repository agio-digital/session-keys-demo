import { logger } from "./logger";

const API_URL = import.meta.env.VITE_API_URL || "";

// Token getter function - set by initHttp
let getAccessToken: (() => Promise<string>) | null = null;

/**
 * Initialize HTTP client with Auth0 token getter.
 * Call this once from App.vue or main.ts after Auth0 is ready.
 */
export function initHttp(tokenGetter: () => Promise<string>) {
  getAccessToken = tokenGetter;
}

/**
 * Make an authenticated HTTP request to the API.
 */
export async function http<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  // Add auth token if available
  if (getAccessToken) {
    try {
      const token = await getAccessToken();
      headers.set("Authorization", `Bearer ${token}`);
    } catch (err) {
      logger.warn({ err }, "Could not get access token");
    }
  }

  const url = `${API_URL}${endpoint}`;
  logger.debug({ method: options.method || "GET", url }, "HTTP request");

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// Convenience methods
http.get = <T>(endpoint: string) => http<T>(endpoint, { method: "GET" });
http.post = <T>(endpoint: string, body: unknown) =>
  http<T>(endpoint, { method: "POST", body: JSON.stringify(body) });
http.put = <T>(endpoint: string, body: unknown) =>
  http<T>(endpoint, { method: "PUT", body: JSON.stringify(body) });
http.delete = <T>(endpoint: string) => http<T>(endpoint, { method: "DELETE" });
