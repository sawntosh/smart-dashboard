// Shared HTTP client for the Express API. Every *Service.js that talks to the
// backend should go through apiRequest so the base URL, auth header and error
// handling stay in one place.
//
// The base URL comes from VITE_API_URL (see frontend/.env.example). When it's
// not set, API_ENABLED is false and the app keeps using localStorage.

const BASE_URL = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");

export const API_ENABLED = BASE_URL !== "";

// Where the login flow (accounts module) saves the token after logging in.
export const TOKEN_KEY = "smart-dashboard.token";

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * fetch() wrapper: adds JSON + auth headers, parses the JSON body and turns
 * network failures and non-2xx responses into ApiError with a readable message.
 */
export async function apiRequest(path, { method = "GET", body, signal } = {}) {
  if (!API_ENABLED) {
    throw new ApiError("API is not configured. Set VITE_API_URL in frontend/.env.local.");
  }

  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new ApiError("Can't reach the server. Is the backend running?");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.message || `Request failed (${res.status}).`, res.status);
  }
  return data;
}

export function apiGet(path, opts) {
  return apiRequest(path, opts);
}
