import { z } from "zod";
import { admin } from "@/lib/supabase";
import { requireOwnedLesson } from "@/lib/auth";
import { handle, ok, readJson, HttpError } from "@/lib/http";
import { ContentSchema, Stage } from "@/lib/types";
import { clock } from "@/lib/lesson-state";
import { IMAGE_EXT, signMaterialImages } from "@/lib/storage";

export const GET = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const { lesson } = await requireOwnedLesson(req, id);
  const image_urls = await signMaterialImages(lesson.images);
  return ok({ lesson, clock: clock(lesson), image_urls });
});

const minutes = z.number().int().min(0).max(180); // 0 — без таймера
const Patch = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  subject: z.string().trim().min(1).max(80).optional(),
  topic: z.string().trim().max(500).optional(),
  grade: z.string().trim().max(40).optional(),
  instructions: z.string().trim().max(2000).optional(),
  durations: z.object({ explain: minutes, test: minutes, tasks: minutes, retell: minutes, board: minutes }).partial().optional(),
  images: z.array(z.string().max(300)).max(8).optional(),
  content: ContentSchema.optional(), // учитель редактирует материалы до запуска
});

export const PATCH = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const { lesson } = await requireOwnedLesson(req, id);
  const { durations, images, ...patch } = Patch.parse(await readJson(req));
  if (lesson.status === "live" || lesson.status === "finished") {
    throw new HttpError(409, "Урок уже запущен — менять настройки нельзя");
  }
  const update: Record<string, unknown> = { ...patch };
  if (patch.content) {
    update.status = "ready";
    update.simplified_explanation = null;
  }
  if (durations) {
    const next: Partial<Record<Stage, number | null>> = { ...(lesson.stage_durations ?? {}) };
    for (const [k, m] of Object.entries(durations)) next[k as Stage] = m ? m * 60 : null;
    update.stage_durations = next;
  }
  if (images) {
    // картинки должны лежать в папке этого урока
    if (images.some((p) => !p.startsWith(`${id}/`) || p.includes("..") || !IMAGE_EXT.test(p))) throw new HttpError(403, "Недопустимый путь к картинке");
    update.images = images;
  }
  if (!Object.keys(update).length) return ok({ lesson });
  const { data, error } = await admin().from("lessons").update(update).eq("id", id).select().single();
  if (error) {
    console.error("patch lesson:", error.message);
    throw new HttpError(500, /column|schema cache/i.test(error.message) ? "База не обновлена: выполните supabase/migrations/002_features.sql" : "Не удалось сохранить");
  }
  return ok({ lesson: data, image_urls: await signMaterialImages(data.images) });
});
