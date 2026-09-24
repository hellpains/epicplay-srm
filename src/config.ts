const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");

export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const API_URL = SUPABASE_URL
  ? `${SUPABASE_URL}/functions/v1/api`
  : (import.meta.env.VITE_API_URL ?? "");

// Имя вошедшего пользователя — уходит в API как `actor` для журнала действий
export function currentActor(): string {
  try {
    const session = JSON.parse(localStorage.getItem("app_auth_session") ?? "null");
    return session?.name || session?.login || "";
  } catch {
    return "";
  }
}
