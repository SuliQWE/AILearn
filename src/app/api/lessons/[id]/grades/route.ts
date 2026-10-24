import { z } from "zod";
import { admin } from "@/lib/supabase";
import { requireOwnedLesson } from "@/lib/auth";
import { handle, ok, readJson, HttpError } from "@/lib/http";

export const GET = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  await requireOwnedLesson(req, id);
  const { data, error } = await admin()
    .from("teacher_grades")
    .select("participant_id, kind, score, comment, updated_at")
    .eq("lesson_id", id);
  if (error) throw new HttpError(500, "Не удалось загрузить оценки");
  return ok({ grades: data });
});

const Body = z.object({
  participantId: z.string().uuid(),
  kind: z.enum(["written", "oral", "open_q"]),
  score: z.number().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

/** Оценки выставляет только учитель. Повторная отправка просто обновляет оценку (идемпотентно). */
export const PUT = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  await requireOwnedLesson(req, id);
  const b = Body.parse(await readJson(req));
  const { data: p } = await admin()
    .from("lesson_participants")
    .select("id")
    .eq("id", b.participantId)
    .eq("lesson_id", id)
    .maybeSingle();
  if (!p) throw new HttpError(404, "Ученик не найден в этом уроке");
  const { data, error } = await admin()
    .from("teacher_grades")
    .upsert(
      {
        lesson_id: id,
        participant_id: b.participantId,
        kind: b.kind,
        score: b.score,
        comment: b.comment ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lesson_id,participant_id,kind" },
    )
    .select()
    .single();
  if (error) throw new HttpError(500, "Не удалось сохранить оценку");
  return ok({ grade: data });
});
