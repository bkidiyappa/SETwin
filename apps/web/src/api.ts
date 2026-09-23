const API_BASE = import.meta.env.VITE_SETWIN_API_URL ?? "/api";

const TOKEN_EVENT = "setwin-token-changed";
const SESSION_KEY = "setwin_session";

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

export function getToken(): string {
  return localStorage.getItem("setwin_token") ?? "";
}

export function setToken(token: string): void {
  localStorage.setItem("setwin_token", token);
  window.dispatchEvent(new Event(TOKEN_EVENT));
}

export function clearToken(): void {
  localStorage.removeItem("setwin_token");
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(TOKEN_EVENT));
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
    const token = getToken();
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
  }
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
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
  if (!getToken()) {
    return null;
  }
  const user = await apiGet<SessionUser>("/auth/me");
  setSessionUser({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    roles: user.roles ?? [],
    permissions: user.permissions ?? [],
  });
  return getSessionUser();
}
