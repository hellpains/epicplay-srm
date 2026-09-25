const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");

export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const API_URL = SUPABASE_URL
  ? `${SUPABASE_URL}/functions/v1/api`
  : (import.meta.env.VITE_API_URL ?? "");

export const SESSION_KEY = "app_auth_session";
// Событие окна: сервер отклонил токен — приложение показывает экран входа
export const AUTH_EXPIRED_EVENT = "auth-expired";

function readSession(): any {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    return null;
  }
}

// Запрос к API с токеном входа. На 401 сообщает приложению, что нужно войти заново.
export async function apiFetch(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = readSession()?.token;
  if (token) headers.set("x-app-token", token);

  const response = await fetch(url, { ...init, headers });
  if (response.status === 401) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  return response;
}
