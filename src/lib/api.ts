const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");
const trimApiSuffix = (value: string) => value.replace(/\/api$/i, "");

const getDefaultApiBaseUrl = () => {
  if (typeof window === "undefined") return "http://localhost:5000";

  const { protocol, hostname } = window.location;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

  if (!isLocalHost) {
    return window.location.origin;
  }

  const safeProtocol = protocol === "https:" ? "https:" : "http:";

  return `${safeProtocol}//${hostname}:5000`;
};

const rawBaseUrl =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  getDefaultApiBaseUrl();

export const API_BASE_URL = trimApiSuffix(trimTrailingSlash(rawBaseUrl));
export const API_URL = `${API_BASE_URL}/api`;

export const AUTH_TOKEN_KEY = "auth_token";
export const REMEMBER_ME_KEY = "remember_me";
export const REMEMBERED_IDENTIFIER_KEY = "remembered_login_identifier";

export const getAuthToken = () => {
  if (typeof window === "undefined") return null;

  const activeTabToken = sessionStorage.getItem(AUTH_TOKEN_KEY);
  if (activeTabToken) return activeTabToken;

  const rememberedToken = localStorage.getItem(AUTH_TOKEN_KEY);
  if (rememberedToken) {
    // Keep the active session isolated from later logins in other browser tabs.
    sessionStorage.setItem(AUTH_TOKEN_KEY, rememberedToken);
  }

  return rememberedToken;
};

export const getRememberMePreference = () => {
  if (typeof window === "undefined") return false;

  return localStorage.getItem(REMEMBER_ME_KEY) === "true";
};

export const setAuthToken = (token: string, rememberMe: boolean) => {
  if (typeof window === "undefined") return;

  // Every tab keeps its own active account. localStorage is only the optional
  // remembered session used to initialize a newly opened tab.
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);

  if (rememberMe) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
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

const getSameOriginApiFallbackUrl = (input: string) => {
  if (typeof window === "undefined") return null;

  try {
    const requestUrl = new URL(input, window.location.href);
    const apiBaseUrl = new URL(API_BASE_URL, window.location.href);

    if (requestUrl.origin !== apiBaseUrl.origin || !requestUrl.pathname.startsWith("/api")) {
      return null;
    }

    const fallbackUrl = `${requestUrl.pathname}${requestUrl.search}${requestUrl.hash}`;
    return new URL(fallbackUrl, window.location.href).href === requestUrl.href ? null : fallbackUrl;
  } catch {
    return null;
  }
};

const buildApiConnectionError = (error: unknown, fallbackUrl?: string | null) => {
  void error;
  void fallbackUrl;
  return new Error("Unable to connect to the server. Please check your connection and try again.");
};

const INTERNAL_ERROR_PATTERN = /(?:sql|database|stack|exception|jwt|token|secret|password_hash|node_modules|[a-z]:\\|\/home\/|\/var\/|select\s.+from|insert\s+into|update\s+.+set)/i;

const getSafeApiErrorMessage = (payload: unknown, status: number) => {
  const candidate = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
    ? payload.error.trim()
    : "";

  if (candidate && candidate.length <= 300 && !INTERNAL_ERROR_PATTERN.test(candidate)) {
    return candidate;
  }

  if (status === 401) return "Please sign in to continue.";
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 404) return "The requested information could not be found.";
  if (status === 429) return "Too many requests. Please wait and try again.";
  return "Unable to complete your request. Please try again.";
};

export const fetchApi = async (input: string, init?: RequestInit) => {
  try {
    return await fetch(input, init);
  } catch (error) {
    const method = String(init?.method || "GET").toUpperCase();
    const canRetrySafely = method === "GET" || method === "HEAD";
    if (!canRetrySafely) {
      throw buildApiConnectionError(error);
    }

    const fallbackUrl = getSameOriginApiFallbackUrl(input);

    if (fallbackUrl) {
      try {
        return await fetch(fallbackUrl, init);
      } catch (fallbackError) {
        throw buildApiConnectionError(fallbackError, fallbackUrl);
      }
    }

    throw buildApiConnectionError(error);
  }
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
    const message = getSafeApiErrorMessage(payload, response.status);

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
