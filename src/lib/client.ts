"use client";
import { createClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { cleanSupabaseUrl } from "./url";

// Обращения к process.env.NEXT_PUBLIC_* должны быть буквальными — иначе Next не подставит значения в браузер.
const SB_URL = cleanSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SB_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
/** false — в .env.local не заданы ключи Supabase (показываем понятное сообщение вместо белого экрана). */
export const envOk = !!SB_URL && !!SB_KEY;

export const sb = createClient(SB_URL || "http://localhost:54321", SB_KEY || "missing-key");

/** Переводит ошибки Supabase Auth в понятный текст — вместо «неверный пароль» на любую ошибку. */
export function authMsg(m: string): string {
  if (/invalid login credentials/i.test(m)) return "Неверная почта или пароль. Если аккаунта ещё нет — создайте его на вкладке «Регистрация».";
  if (/email not confirmed/i.test(m)) return "Почта не подтверждена. Создайте аккаунт заново на вкладке «Регистрация» (он подтверждается сразу).";
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(m)) return "Нет связи с Supabase. Проверьте интернет и NEXT_PUBLIC_SUPABASE_URL в .env.local (без /rest/v1/), затем перезапустите npm run dev.";
  if (/invalid api key|apikey/i.test(m)) return "Supabase не принял ключ. Проверьте NEXT_PUBLIC_SUPABASE_ANON_KEY (sb_publishable_…) в .env.local.";
  if (/rate limit|too many/i.test(m)) return "Слишком много попыток. Подождите минуту и повторите.";
  return m;
}

async function call(path: string, headers: Record<string, string>, body?: unknown, method?: string): Promise<any> {
  const res = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e: any = new Error(j.error || "Ошибка запроса. Проверьте соединение");
    e.status = res.status;
    throw e;
  }
  return j;
}

export async function tapi(path: string, body?: unknown, method?: string): Promise<any> {
  const { data } = await sb.auth.getSession();
  return call(path, { authorization: `Bearer ${data.session?.access_token ?? ""}` }, body, method);
}
export const stoken = (code: string) => (typeof window === "undefined" ? "" : localStorage.getItem("pt:" + code.toUpperCase()) ?? "");
export const sapi = (code: string, path: string, body?: unknown): Promise<any> =>
  call(`/api/play/${code}/${path}`, { "x-participant-token": stoken(code) }, body);

export const fmt = (s: number | null) => (s == null ? "" : `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);

/** Опрос сервера. Ошибки сети не ломают страницу — показываем последнюю версию данных. */
export function usePoll(fn: () => Promise<any>, ms: number, onErr?: (e: any) => void) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const f = useRef(fn); f.current = fn;
  const oe = useRef(onErr); oe.current = onErr;
  const load = useCallback(async () => {
    try { setData(await f.current()); setErr(""); } catch (e: any) { setErr(e.message); oe.current?.(e); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, ms); return () => clearInterval(t); }, [load, ms]);
  return { data, err, reload: load };
}

/** Обратный отсчёт на основе времени сервера (пересинхронизируется при каждом опросе). */
export function useCountdown(clock: any): number | null {
  const [, tick] = useState(0);
  const at = useRef(Date.now());
  useEffect(() => { at.current = Date.now(); }, [clock]);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 250); return () => clearInterval(t); }, []);
  if (!clock || clock.remainingMs == null) return null;
  const ms = clock.running ? clock.remainingMs - (Date.now() - at.current) : clock.remainingMs;
  return Math.max(0, Math.ceil(ms / 1000));
}

export const STAGE: Record<string, string> = {
  explain: "Объяснение", test: "Мини-тест", tasks: "Задачи", retell: "Пересказ", board: "Ответ у доски", review: "Проверка", done: "Завершён",
};
export const ORDER = ["explain", "test", "tasks", "retell", "board", "review", "done"];
