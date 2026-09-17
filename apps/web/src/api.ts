const API_BASE = import.meta.env.VITE_SETWIN_API_URL ?? "/api";

export function getToken(): string {
  return localStorage.getItem("setwin_token") ?? "";
}

export function setToken(token: string): void {
  localStorage.setItem("setwin_token", token);
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  const token = getToken();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE}${path}`, { headers });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}
