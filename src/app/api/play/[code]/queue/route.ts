import { admin } from "@/lib/supabase";
import { requireParticipant } from "@/lib/auth";
import { handle, ok, HttpError } from "@/lib/http";
import { acceptsWork } from "@/lib/lesson-state";

/** Ученик встаёт в очередь для устного ответа. Повторное нажатие не создаёт дубль и не меняет место. */
export const POST = handle<{ code: string }>(async (req, { params }) => {
  const { code } = await params;
  const { lesson, participant } = await requireParticipant(req, code);
  if (!acceptsWork(lesson, "board") && !acceptsWork(lesson, "retell")) {
    throw new HttpError(409, "Очередь сейчас закрыта");
  }
  const db = admin();
  const { error } = await db
    .from("speak_queue")
    .upsert({ lesson_id: lesson.id, participant_id: participant.id }, { onConflict: "lesson_id,participant_id", ignoreDuplicates: true });
  if (error) throw new HttpError(500, "Не удалось встать в очередь");

  const { data: q } = await db.from("speak_queue").select("participant_id, status").eq("lesson_id", lesson.id).order("created_at");
  const waiting = (q ?? []).filter((x) => x.status === "waiting");
  const idx = waiting.findIndex((x) => x.participant_id === participant.id);
  return ok({ in_queue: true, position: idx >= 0 ? idx + 1 : null });
});
