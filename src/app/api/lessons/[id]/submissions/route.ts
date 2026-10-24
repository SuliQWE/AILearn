import { admin } from "@/lib/supabase";
import { requireOwnedLesson } from "@/lib/auth";
import { handle, ok } from "@/lib/http";

/** Для учителя: ответы теста, открытые ответы и фото решений (подписанные ссылки на 1 час). ИИ их НЕ проверяет. */
export const GET = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  await requireOwnedLesson(req, id);
  const db = admin();

  const [parts, answers, photos, grades] = await Promise.all([
    db.from("lesson_participants").select("id, name").eq("lesson_id", id).order("name"),
    db.from("test_answers").select("participant_id, question_idx, kind, choice, text_answer, is_correct").eq("lesson_id", id),
    db.from("task_submissions").select("id, participant_id, task_idx, storage_path, created_at").eq("lesson_id", id).order("created_at"),
    db.from("teacher_grades").select("participant_id, kind, score, comment").eq("lesson_id", id),
  ]);

  const paths = (photos.data ?? []).map((p) => p.storage_path);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await db.storage.from("submissions").createSignedUrls(paths, 3600);
    for (const u of data ?? []) if (u.path && u.signedUrl) urls.set(u.path, u.signedUrl);
  }

  const students = (parts.data ?? []).map((p) => ({
    participant_id: p.id,
    name: p.name,
    answers: (answers.data ?? []).filter((a) => a.participant_id === p.id).sort((a, b) => a.question_idx - b.question_idx),
    photos: (photos.data ?? [])
      .filter((x) => x.participant_id === p.id)
      .map((x) => ({ id: x.id, task_idx: x.task_idx, url: urls.get(x.storage_path) ?? null, created_at: x.created_at })),
    teacher_grades: (grades.data ?? []).filter((g) => g.participant_id === p.id),
  }));
  return ok({ students });
});
