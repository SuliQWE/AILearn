import { cleanSupabaseUrl } from "./url";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Не задана переменная окружения ${name}`);
  return v;
}

export const env = {
  get supabaseUrl() { return cleanSupabaseUrl(need("NEXT_PUBLIC_SUPABASE_URL")); },
  get serviceKey() { return need("SUPABASE_SERVICE_ROLE_KEY").trim(); },
  get geminiKey() { return need("GEMINI_API_KEY").trim(); },
  get geminiModel() { return process.env.GEMINI_MODEL || "gemini-flash-latest"; },
  get appUrl() { return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, ""); },
  get demoEnabled() { return process.env.DEMO_ENABLED === "true"; },
};
