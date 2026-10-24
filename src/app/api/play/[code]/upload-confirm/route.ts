import { z } from "zod";
import { admin } from "@/lib/supabase";
import { requireParticipant } from "@/lib/auth";
import { handle, ok, readJson, HttpError } from "@/lib/http";
import { acceptsWork } from "@/lib/lesson-state";

const MAX_BYTES = 10 * 1024 * 1024;
const Body = z.object({ path: z.string().min(10).max(300) });

/** Шаг 2: проверяем, что файл реально загружен, и фиксируем его в базе. Повтор безопасен (path уникален). */
export const POST = handle<{ code: string }>(async (req, { params }) => {
  const { code } = await params;
  const { lesson, participant } = await requireParticipant(req, code);
  const { path } = Body.parse(await readJson(req));

  const prefix = `${lesson.id}/${participant.id}/`;
  if (!path.startsWith(prefix) || path.includes("..")) throw new HttpError(403, "Недопустимый путь к файлу");
  const fileName = path.slice(prefix.length);
  const m = fileName.match(/^([01])-/);
  if (!m) throw new HttpError(400, "Некорректное имя файла");
  const taskIdx = Number(m[1]);

  // на подтверждение даём запас — загрузка с телефона может занять время
  if (!acceptsWork(lesson, "tasks", 60_000)) throw new HttpError(409, "Приём решений закрыт");

  const db = admin();
  const { data: files } = await db.storage.from("submissions").list(prefix.slice(0, -1), { search: fileName, limit: 5 });
  const file = (files ?? []).find((f) => f.name === fileName);
  if (!file) throw new HttpError(404, "Файл не найден — загрузка не завершилась. Попробуйте ещё раз");
  const size = Number((file.metadata as { size?: number } | null)?.size ?? 0);
  if (size > MAX_BYTES) {
    await db.storage.from("submissions").remove([path]);
    throw new HttpError(413, "Файл больше 10 МБ");
  }

  const { error } = await db
    .from("task_submissions")
    .upsert(
      { lesson_id: lesson.id, participant_id: participant.id, task_idx: taskIdx, storage_path: path },
      { onConflict: "storage_path", ignoreDuplicates: true },
    );
  if (error) throw new HttpError(500, "Не удалось сохранить фото. Повторите");
  return ok({ saved: true, task_idx: taskIdx });
});
