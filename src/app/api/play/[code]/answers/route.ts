import { z } from "zod";
import { admin } from "@/lib/supabase";
import { requireParticipant } from "@/lib/auth";
import { handle, ok, readJson, HttpError } from "@/lib/http";
import { acceptsWork } from "@/lib/lesson-state";

const Body = z.object({
  answers: z
    .array(
      z.object({
        idx: z.number().int().min(0).max(7),
        choice: z.number().int().min(0).max(3).optional(),
        text: z.string().max(4000).optional(),
      }),
    )
    .max(8),
  final: z.boolean().optional(), // true — «Сдать тест»
});

/**
 * Автосохранение и отправка теста. Проверка вариантов — на сервере по ключу, которого нет у клиента.
 * Повторная отправка безопасна: после «Сдать» ответы заблокированы и запрос возвращает already_submitted.
 */
export const POST = handle<{ code: string }>(async (req, { params }) => {
  const { code } = await params;
  const { lesson, participant } = await requireParticipant(req, code);
  const body = Body.parse(await readJson(req));
  const db = admin();

  const { data: existing } = await db.from("test_submissions").select("participant_id").eq("participant_id", participant.id).maybeSingle();
  if (existing) return ok({ already_submitted: true });

  if (!acceptsWork(lesson, "test")) {
    throw new HttpError(409, "Приём ответов закрыт: время вышло, пауза или этап уже завершён");
  }
  const questions = lesson.content?.questions ?? [];

  const rows = body.answers.map((a) => {
    if (a.idx < 6) {
      if (a.choice == null) throw new HttpError(400, `Не выбран вариант в вопросе ${a.idx + 1}`);
      return {
        lesson_id: lesson.id,
        participant_id: participant.id,
        question_idx: a.idx,
        kind: "mc" as const,
        choice: a.choice,
        text_answer: null,
        is_correct: questions[a.idx] ? questions[a.idx].correct === a.choice : null,
        updated_at: new Date().toISOString(),
      };
    }
    return {
      lesson_id: lesson.id,
      participant_id: participant.id,
      question_idx: a.idx,
      kind: "open" as const,
      choice: null,
      text_answer: (a.text ?? "").trim() || null,
      is_correct: null,
      updated_at: new Date().toISOString(),
    };
  });

  if (rows.length) {
    const { error } = await db.from("test_answers").upsert(rows, { onConflict: "participant_id,question_idx" });
    if (error) throw new HttpError(500, "Не удалось сохранить ответы. Повторите");
  }

  if (body.final) {
    const { error } = await db
      .from("test_submissions")
      .upsert({ participant_id: participant.id, lesson_id: lesson.id }, { onConflict: "participant_id", ignoreDuplicates: true });
    if (error) throw new HttpError(500, "Не удалось сдать тест. Повторите");
    return ok({ submitted: true });
  }
  return ok({ saved: rows.length });
});
