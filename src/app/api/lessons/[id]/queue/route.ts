import { z } from "zod";
import { admin } from "@/lib/supabase";
import { requireOwnedLesson } from "@/lib/auth";
import { handle, ok, readJson, HttpError } from "@/lib/http";

const Body = z.object({
  participantId: z.string().uuid(),
  status: z.enum(["waiting", "called", "done", "skipped"]),
});

/** Учитель вызывает ученика к доске / отмечает ответ. */
export const POST = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  await requireOwnedLesson(req, id);
  const { participantId, status } = Body.parse(await readJson(req));
  const { data, error } = await admin()
    .from("speak_queue")
    .update({ status })
    .eq("lesson_id", id)
    .eq("participant_id", participantId)
    .select()
    .maybeSingle();
  if (error) throw new HttpError(500, "Не удалось обновить очередь");
  if (!data) throw new HttpError(404, "Ученика нет в очереди");
  return ok({ item: data });
});
