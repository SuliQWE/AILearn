import { z } from "zod";
import { admin } from "@/lib/supabase";
import { newToken, sha256 } from "@/lib/auth";
import { handle0, ok, readJson, HttpError } from "@/lib/http";

const MAX_PARTICIPANTS = 60;
const Body = z.object({
  code: z.string().trim().min(4).max(12),
  name: z.string().trim().min(2, "Введите имя (минимум 2 символа)").max(60),
});

/**
 * Вход ученика по коду из ссылки/QR. Регистрация не нужна: сервер выдаёт секретный токен,
 * который браузер хранит у себя и присылает в x-participant-token. В базе лежит только его хеш.
 */
export const POST = handle0(async (req) => {
  const { code, name } = Body.parse(await readJson(req));
  const db = admin();

  const { data: lesson } = await db.from("lessons").select("id, title, status").eq("join_code", code.toUpperCase()).maybeSingle();
  if (!lesson) throw new HttpError(404, "Урок с таким кодом не найден");
  if (lesson.status === "finished") throw new HttpError(410, "Урок завершён — вход по этому коду закрыт");

  const { count } = await db.from("lesson_participants").select("id", { count: "exact", head: true }).eq("lesson_id", lesson.id);
  if ((count ?? 0) >= MAX_PARTICIPANTS) throw new HttpError(429, "В уроке уже максимальное число участников");

  const token = newToken();
  const { data, error } = await db
    .from("lesson_participants")
    .insert({ lesson_id: lesson.id, name, token_hash: sha256(token) })
    .select("id, name")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new HttpError(409, "Такое имя уже есть в уроке. Добавьте фамилию или букву, например «Айбек К.»");
    }
    throw new HttpError(500, "Не удалось войти в урок");
  }
  return ok({ token, participant: data, lesson: { title: lesson.title, status: lesson.status }, code: code.toUpperCase() }, 201);
});

/** Проверка кода до ввода имени: существует ли урок и не завершён ли он. */
export const GET = handle0(async (req) => {
  const code = new URL(req.url).searchParams.get("code")?.trim().toUpperCase() ?? "";
  if (code.length < 4 || code.length > 12) throw new HttpError(400, "Введите код урока");
  const { data: lesson } = await admin().from("lessons").select("title, subject, status").eq("join_code", code).maybeSingle();
  if (!lesson) throw new HttpError(404, "Урок с таким кодом не найден");
  return ok({ title: lesson.title, subject: lesson.subject, status: lesson.status, closed: lesson.status === "finished" });
});
