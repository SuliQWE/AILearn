import { z } from "zod";
import { admin } from "@/lib/supabase";
import { requireOwnedLesson } from "@/lib/auth";
import { handle, ok, readJson, HttpError } from "@/lib/http";
import { geminiJson, Part } from "@/lib/gemini";
import { CONTENT_SYSTEM, contentPrompt } from "@/lib/prompts";
import { pptxToText } from "@/lib/extract";
import { ContentSchema } from "@/lib/types";

export const maxDuration = 60;

const Body = z.object({
  topic: z.string().trim().max(500).optional(),
  grade: z.string().trim().max(40).optional(),
  subject: z.string().trim().max(80).optional(),
  instructions: z.string().trim().max(2000).optional(),
  material_path: z.string().max(300).optional(), // путь из /material-upload
});

const MAX_MATERIAL_BYTES = 15 * 1024 * 1024;

export const POST = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const { lesson } = await requireOwnedLesson(req, id);
  const body = Body.parse(await readJson(req));
  if (lesson.status === "live" || lesson.status === "finished") {
    throw new HttpError(409, "Урок уже запущен — материалы менять нельзя");
  }

  const topic = body.topic || lesson.topic;
  const grade = body.grade || lesson.grade;
  const subject = body.subject || lesson.subject;
  const instructions = body.instructions ?? lesson.instructions;
  if (!topic && !body.material_path) throw new HttpError(400, "Укажите тему или загрузите файл (PDF/PPTX)");

  let materialText = "";
  const extraParts: Part[] = [];

  if (body.material_path) {
    // Файл должен лежать в папке этого урока — иначе можно подсунуть чужой материал
    if (!body.material_path.startsWith(`${id}/`) || body.material_path.includes("..")) {
      throw new HttpError(403, "Недопустимый путь к файлу");
    }
    const { data: blob, error } = await admin().storage.from("materials").download(body.material_path);
    if (error || !blob) throw new HttpError(404, "Файл не найден. Загрузите его заново");
    if (blob.size > MAX_MATERIAL_BYTES) throw new HttpError(413, "Файл больше 15 МБ");
    const ext = body.material_path.split(".").pop()?.toLowerCase();
    const buf = await blob.arrayBuffer();
    if (ext === "pdf") {
      extraParts.push({ inline_data: { mime_type: "application/pdf", data: Buffer.from(buf).toString("base64") } });
    } else if (ext === "pptx") {
      materialText = await pptxToText(buf);
      if (!materialText.trim()) throw new HttpError(422, "В презентации не найден текст");
    } else if (ext === "txt" || ext === "md") {
      materialText = new TextDecoder().decode(buf);
    } else {
      throw new HttpError(415, "Поддерживаются PDF, PPTX, TXT");
    }
  }

  const parts = [...contentPrompt({ topic, grade, subject, instructions, materialText }), ...extraParts];
  const content = await geminiJson(parts, ContentSchema, CONTENT_SYSTEM);

  // Честно сообщаем про отсутствие интернет-поиска (требование ТЗ)
  content.extra_note =
    "Поиск в интернете не подключён. Материалы составлены только на основе темы и загруженного файла; внешние ссылки не добавляются. Проверьте факты перед уроком.";

  const { data, error } = await admin()
    .from("lessons")
    .update({
      content,
      status: "ready",
      topic: topic ?? null,
      grade: grade ?? null,
      subject: subject ?? null,
      instructions: instructions || null,
      simplified_explanation: null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new HttpError(500, "Не удалось сохранить материалы");
  return ok({ lesson: data });
});
