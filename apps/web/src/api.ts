const API_BASE = import.meta.env.VITE_SETWIN_API_URL ?? "/api";

const TOKEN_EVENT = "setwin-token-changed";

export function getToken(): string {
  return localStorage.getItem("setwin_token") ?? "";
}

export function setToken(token: string): void {
  localStorage.setItem("setwin_token", token);
  window.dispatchEvent(new Event(TOKEN_EVENT));
}

export function clearToken(): void {
  localStorage.removeItem("setwin_token");
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
    throw new Error(await response.text());
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

export type LoginResult = {
  token: string;
  user: { username: string; displayName: string; roles: string[] };
};
