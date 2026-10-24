import { createHash, randomBytes } from "crypto";
import { admin } from "./supabase";
import { HttpError } from "./http";
import { LessonRow } from "./types";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без похожих символов
export function newJoinCode(len = 6) {
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** Проверяет access token учителя из Supabase Auth. */
export async function requireTeacher(req: Request) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Требуется вход в аккаунт учителя");
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Сессия недействительна, войдите заново");
  return data.user;
}

/** Урок должен принадлежать этому учителю. */
export async function requireOwnedLesson(req: Request, lessonId: string) {
  const user = await requireTeacher(req);
  const { data, error } = await admin()
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .eq("teacher_id", user.id)
    .maybeSingle();
  if (error) throw new HttpError(500, "Ошибка базы данных");
  if (!data) throw new HttpError(404, "Урок не найден");
  return { user, lesson: data as LessonRow };
}

/** Ученик определяется по секретному токену (заголовок x-participant-token). */
export async function requireParticipant(req: Request, code: string) {
  const token = req.headers.get("x-participant-token") || "";
  if (!token) throw new HttpError(401, "Войдите в урок по ссылке");
  const { data: lesson } = await admin()
    .from("lessons")
    .select("*")
    .eq("join_code", code.toUpperCase())
    .maybeSingle();
  if (!lesson) throw new HttpError(404, "Урок не найден");
  const { data: participant } = await admin()
    .from("lesson_participants")
    .select("id, name, lesson_id")
    .eq("lesson_id", lesson.id)
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (!participant) throw new HttpError(401, "Вы не участвуете в этом уроке. Войдите снова по ссылке");
  // heartbeat «в сети» (не блокируем ответ при ошибке)
  void admin()
    .from("lesson_participants")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", participant.id)
    .then(() => undefined, () => undefined);
  return { lesson: lesson as LessonRow, participant: participant as { id: string; name: string; lesson_id: string } };
}
