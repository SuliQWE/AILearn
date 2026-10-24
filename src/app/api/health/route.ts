import { admin } from "@/lib/supabase";
import { env } from "@/lib/env";
import { cleanSupabaseUrl } from "@/lib/url";
import { handle0, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

async function probe(fn: () => PromiseLike<{ error: { message: string; code?: string } | null }>) {
  try {
    const { error } = await fn();
    if (!error) return { ok: true as const };
    return { ok: false as const, error: error.message, code: error.code };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Диагностика: открой http://localhost:3000/api/health — видно, что именно не настроено. */
export const GET = handle0(async () => {
  const urlRaw = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const hasEnv = !!urlRaw && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  let db: Awaited<ReturnType<typeof probe>> | null = null;
  let auth: Awaited<ReturnType<typeof probe>> | null = null;
  if (hasEnv) {
    db = await probe(() => admin().from("lessons").select("id", { count: "exact", head: true }));
    auth = await probe(() => admin().auth.admin.listUsers({ page: 1, perPage: 1 }));
  }
  const hints: string[] = [];
  if (!hasEnv) hints.push("Заполните NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY и SUPABASE_SERVICE_ROLE_KEY в .env.local и перезапустите npm run dev");
  if (/\/(rest|auth)\/v\d+/i.test(urlRaw)) hints.push("В NEXT_PUBLIC_SUPABASE_URL лишний /rest/v1/ — код его убирает сам, но лучше исправьте");
  if (db && !db.ok && (db.code === "PGRST205" || db.code === "42P01" || /schema cache|does not exist/i.test(db.error))) {
    hints.push("Таблиц нет: выполните supabase/migrations/001_init.sql целиком в Supabase → SQL Editor");
  } else if (db && !db.ok) hints.push("База недоступна — проверьте SUPABASE_SERVICE_ROLE_KEY (sb_secret_...) и адрес проекта");
  if (auth && !auth.ok) hints.push("Auth недоступен — проверьте SUPABASE_SERVICE_ROLE_KEY");
  if (hasEnv && db?.ok) {
    const cols = await probe(() => admin().from("lessons").select("subject, instructions, stage_durations, images", { head: true, count: "exact" }));
    if (!cols.ok) hints.push("Нет новых колонок: выполните supabase/migrations/002_features.sql в Supabase → SQL Editor");
  }
  if (!process.env.GEMINI_API_KEY) hints.push("Нет GEMINI_API_KEY — генерация материалов работать не будет");

  return ok({
    ok: hasEnv && !!db?.ok && !!auth?.ok,
    supabase: hasEnv,
    supabase_host: hasEnv ? cleanSupabaseUrl(urlRaw).replace(/^https?:\/\//, "") : null,
    db,
    auth,
    gemini: !!process.env.GEMINI_API_KEY,
    model: env.geminiModel,
    demo_enabled: env.demoEnabled,
    hints,
  });
});
