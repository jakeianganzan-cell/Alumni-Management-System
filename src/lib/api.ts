const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const getDefaultApiBaseUrl = () => {
  if (typeof window === "undefined") return "http://localhost:3001";

  const { protocol, hostname } = window.location;
  const safeProtocol = protocol === "https:" ? "https:" : "http:";

  return `${safeProtocol}//${hostname}:3001`;
};

const rawBaseUrl =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  getDefaultApiBaseUrl();

export const API_BASE_URL = trimTrailingSlash(rawBaseUrl);
export const API_URL = `${API_BASE_URL}/api`;

export const AUTH_TOKEN_KEY = "auth_token";
export const REMEMBER_ME_KEY = "remember_me";
export const REMEMBERED_IDENTIFIER_KEY = "remembered_login_identifier";

export const getAuthToken = () => {
  if (typeof window === "undefined") return null;

  return sessionStorage.getItem(AUTH_TOKEN_KEY) ?? localStorage.getItem(AUTH_TOKEN_KEY);
};

export const getRememberMePreference = () => {
  if (typeof window === "undefined") return false;

  return localStorage.getItem(REMEMBER_ME_KEY) === "true";
};

export const setAuthToken = (token: string, rememberMe: boolean) => {
  if (typeof window === "undefined") return;

  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);

  if (rememberMe) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  }

  localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? "true" : "false");
};

export const clearAuthToken = () => {
  if (typeof window === "undefined") return;

  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(REMEMBER_ME_KEY);
};

export const getRememberedIdentifier = () => {
  if (typeof window === "undefined") return "";

  return localStorage.getItem(REMEMBERED_IDENTIFIER_KEY) ?? "";
};

export const setRememberedIdentifier = (identifier: string, rememberMe: boolean) => {
  if (typeof window === "undefined") return;

  if (rememberMe && identifier.trim()) {
    localStorage.setItem(REMEMBERED_IDENTIFIER_KEY, identifier.trim());
    return;
  }

  localStorage.removeItem(REMEMBERED_IDENTIFIER_KEY);
};

export const getAuthHeaders = (headers: HeadersInit = {}) => {
  const token = getAuthToken();

  return {
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export class ApiError extends Error {
  status: number;
  payload?: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export const readApiResponse = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  let payload: unknown;

  if (isJson) {
    payload = await response.json();
  } else {
    const text = await response.text();
    payload = text || null;
  }

  if (!response.ok) {
    const message =
      (payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string" &&
        payload.error) ||
      (typeof payload === "string" && payload.trim()) ||
      `Request failed with status ${response.status}`;

    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
};

export const resolveAssetUrl = (value: string | null | undefined) => {
  if (!value) return null;

  const trimmed = value.trim();

  if (!trimmed) return null;
  if (trimmed.startsWith("data:")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `${window.location.protocol}${trimmed}`;
  if (trimmed.startsWith("/")) return `${API_BASE_URL}${trimmed}`;

  if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 80) {
    return `data:image/jpeg;base64,${trimmed}`;
  }

  return trimmed;
};
