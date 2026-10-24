/**
 * Приводит адрес Supabase к базовому виду https://<ref>.supabase.co
 * Частая ошибка — вставить адрес REST API (…/rest/v1/): тогда Auth и Storage не работают.
 */
export function cleanSupabaseUrl(u?: string | null): string {
  let s = (u ?? "").trim().replace(/^["']|["']$/g, "");
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  return s.replace(/\/+$/, "").replace(/\/(rest|auth|storage|realtime|functions)\/v\d+$/i, "").replace(/\/+$/, "");
}
