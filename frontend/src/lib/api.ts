/**
 * API client — autenticação via cookies HttpOnly.
 *
 * Antes (vulneravel): JWTs em localStorage acessível por qualquer JS.
 * Agora: tokens viajam APENAS em cookies HttpOnly setados pelo backend.
 * O JS NUNCA toca os tokens — XSS deixa de exfiltrar sessão.
 *
 * - Reads the API base URL from NEXT_PUBLIC_API_URL.
 * - Each fetch usa `credentials: 'include'` pra os cookies viajarem.
 * - Em 401, tenta refresh uma vez (também via cookie) e replay do request.
 * - Mantém um cookie hint não-secreto (`nexus_session=1`) que só sinaliza
 *   "logado" pra middleware Next.js conseguir redirecionar SSR sem
 *   precisar consultar o backend.
 */

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'
).replace(/\/$/, '');

export type AuthTokens = { detail: string };

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// ---------- session presence hint (non-secret) ----------
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

function hasSessionCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((c) => c.trim().startsWith(`${SESSION_COOKIE}=1`));
}

export const tokenStore = {
  /**
   * Compat: alguns componentes ainda chamam `tokenStore.getAccess()` pra
   * decidir se mostram UI autenticada. Não temos mais o token de fato no
   * JS — devolvemos um placeholder não-vazio quando o cookie de sessão
   * indica login. Quem só checa truthy continua funcionando.
   */
  getAccess(): string | null {
    return hasSessionCookie() ? 'cookie' : null;
  },
  getRefresh(): string | null {
    return null; // refresh é HttpOnly; JS não lê.
  },
  set() {
    // Sinaliza presença de sessão (não-secreto) pra middleware Next.js.
    setSessionCookie('1', 60 * 60 * 24 * 7);
    // Limpa qualquer resíduo de localStorage de sessões antigas.
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('access_token');
      window.localStorage.removeItem('refresh_token');
    }
  },
  clear() {
    clearSessionCookie();
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('access_token');
      window.localStorage.removeItem('refresh_token');
    }
  },
};

// ---------- refresh queue (so concurrent 401s only refresh once) ----------
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_URL}/token/refresh/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // Body vazio: backend lê o refresh do cookie HttpOnly.
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        tokenStore.clear();
        return false;
      }
      return true;
    } catch {
      tokenStore.clear();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

// ---------- core request ----------
type RequestOptions = RequestInit & {
  /** Set false to skip auth concerns (the cookie still goes anyway via include). */
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

  const url = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;

  // credentials: 'include' garante que cookies HttpOnly viajem em
  // requests cross-origin (dev: localhost:3000 ↔ localhost:8000)
  // e same-origin (prod: tudo em nexus.arasaka.fun).
  let response = await fetch(url, {
    ...rest,
    headers: finalHeaders,
    body: finalBody,
    credentials: 'include',
  });

  if (response.status === 401 && auth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await fetch(url, {
        ...rest,
        headers: finalHeaders,
        body: finalBody,
        credentials: 'include',
      });
    }
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    let message: string;
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      message = retryAfter
        ? `Pedidos demais. Tente de novo em ${retryAfter}s.`
        : 'Pedidos demais. Aguarde alguns segundos.';
    } else if (
      isJson &&
      payload &&
      typeof payload === 'object' &&
      'detail' in payload
    ) {
      message = String((payload as { detail: unknown }).detail);
    } else {
      message = `Request failed with status ${response.status}`;
    }
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
  async login(
    username: string,
    password: string,
    turnstileToken: string,
  ): Promise<void> {
    // Backend seta cookies HttpOnly (nexus_access, nexus_refresh) e
    // devolve só {detail: 'authenticated'}. JS marca presença de sessão.
    // turnstileToken vai como turnstile_token e e validado antes do
    // simplejwt sequer tentar credenciais.
    await api.post(
      '/token/',
      { username, password, turnstile_token: turnstileToken },
      { auth: false },
    );
    tokenStore.set();
  },
  async register(payload: {
    username: string;
    email: string;
    password: string;
    birthdate: string;
    turnstileToken: string;
  }): Promise<{ user: { id: number; username: string; email: string } }> {
    const { turnstileToken, ...rest } = payload;
    const data = await api.post<{
      user: { id: number; username: string; email: string };
    }>(
      '/auth/register/',
      { ...rest, turnstile_token: turnstileToken },
      { auth: false },
    );
    tokenStore.set();
    return data;
  },
  async logout(): Promise<void> {
    try {
      // Backend lê o refresh do cookie e blacklist; tambem limpa cookies.
      await api.post('/auth/logout/', {});
    } catch {
      // Mesmo se servidor falhar, limpamos a sessão local.
    } finally {
      tokenStore.clear();
    }
  },
  async me(): Promise<{ id: number; username: string; email: string; is_staff: boolean }> {
    return api.get('/auth/me/');
  },
  isAuthenticated(): boolean {
    return hasSessionCookie();
  },
};
