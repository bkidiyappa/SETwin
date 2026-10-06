const API_BASE = import.meta.env.VITE_SETWIN_API_URL ?? "/api";

const TOKEN_EVENT = "setwin-token-changed";
const SESSION_KEY = "setwin_session";
const SIGNED_IN_KEY = "setwin_signed_in";
const LEGACY_TOKEN_KEY = "setwin_token";

export type SessionUser = {
  id?: string;
  username: string;
  displayName: string;
  roles: string[];
  permissions: string[];
};

export type LoginResult = {
  token: string;
  user: SessionUser;
};

function legacyToken(): string {
  return localStorage.getItem(LEGACY_TOKEN_KEY) ?? "";
}

export function isSignedIn(): boolean {
  return sessionStorage.getItem(SIGNED_IN_KEY) === "1" || Boolean(legacyToken()) || Boolean(getSessionUser());
}

/** Truthy when a session cookie, a legacy token, or a stored user is present. The value is not a credential. */
export function getToken(): string {
  return isSignedIn() ? "1" : "";
}

export function setToken(_token: string): void {
  sessionStorage.setItem(SIGNED_IN_KEY, "1");
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  window.dispatchEvent(new Event(TOKEN_EVENT));
}

export function clearToken(): void {
  sessionStorage.removeItem(SIGNED_IN_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(TOKEN_EVENT));
}

export async function signOut(): Promise<void> {
  try {
    await apiPost("/auth/logout", {});
  } catch {
    // The cookie may already be gone. Local state still clears.
  }
  clearToken();
}

export function getSessionUser(): SessionUser | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function setSessionUser(user: SessionUser): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(TOKEN_EVENT));
}

export function onTokenChange(listener: () => void): () => void {
  window.addEventListener(TOKEN_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(TOKEN_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function hasPermission(permission: string, user?: SessionUser | null): boolean {
  const session = user ?? getSessionUser();
  if (!session) {
    return false;
  }
  if (session.roles.includes("administrator")) {
    return true;
  }
  return session.permissions.includes(permission);
}

export function hasRole(role: string, user?: SessionUser | null): boolean {
  const session = user ?? getSessionUser();
  if (!session) {
    return false;
  }
  return session.roles.includes("administrator") || session.roles.includes(role);
}

async function request<T>(path: string, init?: RequestInit, options?: { skipAuth?: boolean }): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (!options?.skipAuth) {
    const token = legacyToken();
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
  }
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: "include" });
  if (!response.ok) {
    const raw = await response.text();
    let message = raw;
    try {
      const parsed = JSON.parse(raw) as { error?: string; message?: string };
      message = parsed.error || parsed.message || raw;
    } catch {
      // keep raw text
    }
    throw new Error(message || `HTTP ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export async function apiPost<T>(path: string, body: unknown, options?: { skipAuth?: boolean }): Promise<T> {
  return request<T>(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    options,
  );
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

export async function refreshSession(): Promise<SessionUser | null> {
  if (!isSignedIn()) {
    return null;
  }
  try {
    const user = await apiGet<SessionUser>("/auth/me");
    sessionStorage.setItem(SIGNED_IN_KEY, "1");
    setSessionUser({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      roles: user.roles ?? [],
      permissions: user.permissions ?? [],
    });
    return getSessionUser();
  } catch {
    clearToken();
    return null;
  }
}
