/**
 * Centralized API client.
 *
 * - Reads the API base URL from NEXT_PUBLIC_API_URL (no more hardcoded localhost).
 * - Attaches the current access token automatically on protected calls.
 * - On 401 (token expired), tries to refresh exactly once and replays the request.
 * - Persists tokens in localStorage for now; this will move to HttpOnly cookies
 *   when we wire SSR auth in a later phase.
 */

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'
).replace(/\/$/, '');

const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';

export type AuthTokens = { access: string; refresh: string };

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// ---------- token storage ----------
const SESSION_COOKIE = 'nexus_session';

function setSessionCookie(value: string, maxAgeSeconds: number) {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

function clearSessionCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export const tokenStore = {
  getAccess(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACCESS_KEY);
  },
  getRefresh(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(REFRESH_KEY);
  },
  set({ access, refresh }: AuthTokens) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ACCESS_KEY, access);
    if (refresh) window.localStorage.setItem(REFRESH_KEY, refresh);
    // Hint cookie for the edge middleware. Not security-critical; the API still validates JWTs.
    setSessionCookie('1', 60 * 60 * 24 * 7);
  },
  clear() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    clearSessionCookie();
  },
};

// ---------- refresh queue (so concurrent 401s only refresh once) ----------
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return null;

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_URL}/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });
      if (!res.ok) {
        tokenStore.clear();
        return null;
      }
      const data = (await res.json()) as { access: string; refresh?: string };
      tokenStore.set({ access: data.access, refresh: data.refresh ?? refresh });
      return data.access;
    } catch {
      tokenStore.clear();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

// ---------- core request ----------
type RequestOptions = RequestInit & {
  /** Set false to skip auth headers (useful for /token/, /auth/register/). */
  auth?: boolean;
  /** Already-stringified or plain object — we'll JSON.stringify if it's an object. */
  json?: unknown;
};

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { auth = true, json, headers, body, ...rest } = options;

  const finalHeaders = new Headers(headers ?? {});
  let finalBody = body as BodyInit | null | undefined;

  if (json !== undefined) {
    finalHeaders.set('Content-Type', 'application/json');
    finalBody = JSON.stringify(json);
  }

  if (auth) {
    const access = tokenStore.getAccess();
    if (access) finalHeaders.set('Authorization', `Bearer ${access}`);
  }

  const url = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;

  let response = await fetch(url, { ...rest, headers: finalHeaders, body: finalBody });

  if (response.status === 401 && auth) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      finalHeaders.set('Authorization', `Bearer ${newAccess}`);
      response = await fetch(url, { ...rest, headers: finalHeaders, body: finalBody });
    }
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    const message =
      (isJson && payload && typeof payload === 'object' && 'detail' in payload
        ? String((payload as { detail: unknown }).detail)
        : `Request failed with status ${response.status}`);
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

// ---------- typed helpers ----------
export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', json: body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', json: body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PUT', json: body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
};

// ---------- auth helpers ----------
export const auth = {
  async login(username: string, password: string): Promise<AuthTokens> {
    const tokens = await api.post<AuthTokens>(
      '/token/',
      { username, password },
      { auth: false },
    );
    tokenStore.set(tokens);
    return tokens;
  },
  async register(payload: {
    username: string;
    email: string;
    password: string;
  }): Promise<{ access: string; refresh: string; user: { id: number; username: string; email: string } }> {
    const data = await api.post<{
      access: string;
      refresh: string;
      user: { id: number; username: string; email: string };
    }>('/auth/register/', payload, { auth: false });
    tokenStore.set({ access: data.access, refresh: data.refresh });
    return data;
  },
  async logout(): Promise<void> {
    const refresh = tokenStore.getRefresh();
    try {
      if (refresh) {
        await api.post('/auth/logout/', { refresh });
      }
    } catch {
      // We still want to clear local state even if the server call fails.
    } finally {
      tokenStore.clear();
    }
  },
  async me(): Promise<{ id: number; username: string; email: string; is_staff: boolean }> {
    return api.get('/auth/me/');
  },
  isAuthenticated(): boolean {
    return Boolean(tokenStore.getAccess());
  },
};
