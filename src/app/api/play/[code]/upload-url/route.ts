import { randomUUID } from "crypto";
import { z } from "zod";
import { admin } from "@/lib/supabase";
import { requireParticipant } from "@/lib/auth";
import { handle, ok, readJson, HttpError } from "@/lib/http";
import { acceptsWork } from "@/lib/lesson-state";

const MAX_PHOTOS_PER_TASK = 3;
const Body = z.object({
  task_idx: z.number().int().min(0).max(1),
  ext: z.enum(["jpg", "jpeg", "png", "webp", "heic"]),
});

/**
 * Шаг 1 загрузки фото решения: сервер проверяет этап и лимиты и выдаёт одноразовую подписанную ссылку.
 * Файл идёт напрямую в закрытый бакет (в обход лимита тела запроса на хостинге — фото с телефона бывают 5+ МБ).
 */
export const POST = handle<{ code: string }>(async (req, { params }) => {
  const { code } = await params;
  const { lesson, participant } = await requireParticipant(req, code);
  const { task_idx, ext } = Body.parse(await readJson(req));
  if (!acceptsWork(lesson, "tasks", 5000)) throw new HttpError(409, "Приём решений закрыт: время вышло или этап завершён");

  const { count } = await admin()
    .from("task_submissions")
    .select("id", { count: "exact", head: true })
    .eq("participant_id", participant.id)
    .eq("task_idx", task_idx);
  if ((count ?? 0) >= MAX_PHOTOS_PER_TASK) throw new HttpError(409, `Для одной задачи можно загрузить до ${MAX_PHOTOS_PER_TASK} фото`);

  const path = `${lesson.id}/${participant.id}/${task_idx}-${randomUUID()}.${ext}`;
  const { data, error } = await admin().storage.from("submissions").createSignedUploadUrl(path);
  if (error || !data) throw new HttpError(500, "Не удалось подготовить загрузку");
  // Клиент: supabase.storage.from("submissions").uploadToSignedUrl(path, token, file, { contentType })
  return ok({ bucket: "submissions", path: data.path, token: data.token });
});
