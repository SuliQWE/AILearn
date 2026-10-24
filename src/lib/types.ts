import { z } from "zod";

export const STAGES = ["explain", "test", "tasks", "retell", "board", "review", "done"] as const;
export type Stage = (typeof STAGES)[number];

export const ContentSchema = z.object({
  explanation: z.string().min(50),
  examples: z.array(z.string().min(5)).min(2).max(6),
  questions: z
    .array(
      z.object({
        topic: z.string().min(2).max(80),
        q: z.string().min(5),
        options: z.array(z.string().min(1)).length(4),
        correct: z.number().int().min(0).max(3),
      }),
    )
    .length(6),
  open_questions: z.array(z.object({ q: z.string().min(5), hint: z.string().optional() })).length(2),
  tasks: z.array(z.object({ title: z.string().min(2), text: z.string().min(10) })).length(2),
  retell_prompt: z.string().min(5),
  // формулы/уравнения темы: красивая запись + «как писать в тетрадь» (для математики, физики, химии…)
  formulas: z
    .array(z.object({ title: z.string().min(1), latex: z.string().min(1), notebook: z.string().min(5), example: z.string().optional() }))
    .max(8)
    .default([]),
  extra_materials: z.array(z.object({ title: z.string(), text: z.string() })).max(4).default([]),
  extra_note: z.string().optional(),
});
export type LessonContent = z.infer<typeof ContentSchema>;

export interface LessonRow {
  id: string;
  teacher_id: string;
  class_id: string | null;
  title: string;
  topic: string | null;
  grade: string | null;
  join_code: string;
  status: "draft" | "ready" | "live" | "finished";
  stage: Stage;
  stage_started_at: string | null;
  paused_at: string | null;
  paused_total_ms: number;
  stage_extra_sec: number;
  content: LessonContent | null;
  simplified_explanation: string | null;
  subject: string | null;
  instructions: string | null;
  /** Длительность этапов в секундах; null — без таймера; нет ключа — значение по умолчанию. */
  stage_durations: Partial<Record<Stage, number | null>> | null;
  /** Пути картинок (формулы/слайды), загруженных учителем, в бакете materials. */
  images: string[] | null;
  created_at: string;
}
