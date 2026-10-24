import { z } from "zod";
import { admin } from "@/lib/supabase";
import { requireTeacher, newJoinCode } from "@/lib/auth";
import { handle0, ok, readJson, HttpError } from "@/lib/http";

export const GET = handle0(async (req) => {
  const user = await requireTeacher(req);
  const { data, error } = await admin()
    .from("lessons")
    .select("id, title, subject, topic, join_code, status, stage, class_id, created_at")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new HttpError(500, "Не удалось загрузить уроки");
  return ok({ lessons: data });
});

const Body = z.object({
  subject: z.string().trim().min(1, "Укажите предмет").max(80),
  title: z.string().trim().min(1).max(160),
  topic: z.string().trim().max(500).optional(),
  grade: z.string().trim().max(40).optional(),
  class_id: z.string().uuid().optional(),
});

export const POST = handle0(async (req) => {
  const user = await requireTeacher(req);
  const body = Body.parse(await readJson(req));

  if (body.class_id) {
    const { data } = await admin().from("classes").select("id").eq("id", body.class_id).eq("teacher_id", user.id).maybeSingle();
    if (!data) throw new HttpError(404, "Класс не найден");
  }

  // join_code уникален; при редкой коллизии пробуем снова
  for (let i = 0; i < 5; i++) {
    const { data, error } = await admin()
      .from("lessons")
      .insert({
        teacher_id: user.id,
        title: body.title,
        subject: body.subject,
        topic: body.topic ?? null,
        grade: body.grade ?? null,
        class_id: body.class_id ?? null,
        join_code: newJoinCode(),
      })
      .select()
      .single();
    if (!error) return ok({ lesson: data }, 201);
    if (error.code !== "23505") {
      console.error("create lesson:", error.message);
      if (/column|schema cache/i.test(error.message)) throw new HttpError(500, "База не обновлена: выполните supabase/migrations/002_features.sql в Supabase → SQL Editor");
      throw new HttpError(500, "Не удалось создать урок");
    }
  }
  throw new HttpError(500, "Не удалось сгенерировать уникальный код урока");
});
