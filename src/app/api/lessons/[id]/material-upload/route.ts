import { randomUUID } from "crypto";
import { z } from "zod";
import { admin } from "@/lib/supabase";
import { requireOwnedLesson } from "@/lib/auth";
import { handle, ok, readJson, HttpError } from "@/lib/http";

// Шаг 1: учитель получает подписанный URL и грузит файл напрямую в Storage (в обход лимита тела запроса на хостинге).
const Body = z.object({ ext: z.enum(["pdf", "pptx", "txt", "md", "png", "jpg", "jpeg", "webp"]) });

export const POST = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  await requireOwnedLesson(req, id);
  const { ext } = Body.parse(await readJson(req));
  const path = `${id}/${randomUUID()}.${ext}`;
  const { data, error } = await admin().storage.from("materials").createSignedUploadUrl(path);
  if (error || !data) throw new HttpError(500, "Не удалось подготовить загрузку");
  // Клиент: supabase.storage.from("materials").uploadToSignedUrl(path, token, file)
  return ok({ bucket: "materials", path: data.path, token: data.token });
});
