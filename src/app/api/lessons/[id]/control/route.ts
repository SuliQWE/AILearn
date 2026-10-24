import { z } from "zod";
import { admin } from "@/lib/supabase";
import { requireOwnedLesson } from "@/lib/auth";
import { handle, ok, readJson, HttpError } from "@/lib/http";
import { clock, nextStage } from "@/lib/lesson-state";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("next") }),
  z.object({ action: z.literal("extend"), seconds: z.number().int().min(10).max(600).default(60) }),
]);

/**
 * Состояние урока меняет только сервер. Все переходы защищены условием на текущее
 * состояние (оптимистичная блокировка), поэтому двойной клик не перескочит два этапа.
 */
export const POST = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const { lesson } = await requireOwnedLesson(req, id);
  const body = Body.parse(await readJson(req));
  const now = new Date().toISOString();
  let update: Record<string, unknown>;

  switch (body.action) {
    case "start": {
      if (lesson.status === "live") return ok({ lesson, clock: clock(lesson) }); // идемпотентно
      if (lesson.status !== "ready") throw new HttpError(409, "Сначала сгенерируйте материалы урока");
      update = { status: "live", stage: "explain", stage_started_at: now, paused_at: null, paused_total_ms: 0, stage_extra_sec: 0 };
      break;
    }
    case "pause": {
      if (lesson.status !== "live") throw new HttpError(409, "Урок не запущен");
      if (lesson.paused_at) return ok({ lesson, clock: clock(lesson) });
      update = { paused_at: now };
      break;
    }
    case "resume": {
      if (lesson.status !== "live") throw new HttpError(409, "Урок не запущен");
      if (!lesson.paused_at) return ok({ lesson, clock: clock(lesson) });
      const pausedMs = Date.now() - Date.parse(lesson.paused_at);
      update = { paused_at: null, paused_total_ms: Number(lesson.paused_total_ms) + Math.max(0, pausedMs) };
      break;
    }
    case "next": {
      if (lesson.status !== "live") throw new HttpError(409, "Урок не запущен");
      const n = nextStage(lesson.stage);
      if (!n) throw new HttpError(409, "Урок уже завершён");
      update = {
        stage: n,
        stage_started_at: now,
        paused_at: null,
        paused_total_ms: 0,
        stage_extra_sec: 0,
        ...(n === "done" ? { status: "finished" } : {}),
      };
      break;
    }
    case "extend": {
      if (lesson.status !== "live") throw new HttpError(409, "Урок не запущен");
      update = { stage_extra_sec: (lesson.stage_extra_sec || 0) + body.seconds };
      break;
    }
  }

  const { data, error } = await admin()
    .from("lessons")
    .update(update)
    .eq("id", id)
    .eq("stage", lesson.stage) // защита от гонки
    .eq("status", lesson.status)
    .select()
    .maybeSingle();
  if (error) throw new HttpError(500, "Не удалось изменить состояние урока");
  if (!data) throw new HttpError(409, "Состояние урока уже изменилось, обновите страницу");
  return ok({ lesson: data, clock: clock(data) });
});
