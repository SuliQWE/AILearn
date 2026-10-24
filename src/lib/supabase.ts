import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let client: SupabaseClient | null = null;

/** Серверный клиент с service role. Использовать ТОЛЬКО в API-маршрутах. */
export function admin(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl, env.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
