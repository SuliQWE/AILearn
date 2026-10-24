import { admin } from "@/lib/supabase";
import { requireOwnedLesson } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
import { clock } from "@/lib/lesson-state";

const ONLINE_MS = 15_000;

/** Снимок для панели учителя (+ Realtime по таблицам даёт мгновенные обновления). */
export const GET = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const { lesson } = await requireOwnedLesson(req, id);
  const db = admin();

  const [participants, submissions, answers, photos, queue, roster] = await Promise.all([
    db.from("lesson_participants").select("id, name, joined_at, last_seen_at").eq("lesson_id", id).order("joined_at"),
    db.from("test_submissions").select("participant_id, submitted_at").eq("lesson_id", id),
    db.from("test_answers").select("participant_id").eq("lesson_id", id),
    db.from("task_submissions").select("participant_id, task_idx").eq("lesson_id", id),
    db.from("speak_queue").select("id, participant_id, status, created_at").eq("lesson_id", id).order("created_at"),
    lesson.class_id
      ? db.from("class_students").select("id, full_name").eq("class_id", lesson.class_id).order("full_name")
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);

  const now = Date.now();
  const submitted = new Set((submissions.data ?? []).map((s) => s.participant_id));
  const answeredCount = new Map<string, number>();
  for (const a of answers.data ?? []) answeredCount.set(a.participant_id, (answeredCount.get(a.participant_id) ?? 0) + 1);
  const photoMap = new Map<string, Set<number>>();
  for (const p of photos.data ?? []) {
    if (!photoMap.has(p.participant_id)) photoMap.set(p.participant_id, new Set());
    photoMap.get(p.participant_id)!.add(p.task_idx);
  }

  const list = (participants.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    online: now - Date.parse(p.last_seen_at) < ONLINE_MS,
    test_answered: answeredCount.get(p.id) ?? 0,
    test_submitted: submitted.has(p.id),
    tasks_with_photo: Array.from(photoMap.get(p.id) ?? []).sort(),
  }));

  const nameById = new Map(list.map((p) => [p.id, p.name]));
  const joinedNames = new Set(list.map((p) => p.name.toLowerCase()));
  const notJoined = (roster.data ?? []).filter((s) => !joinedNames.has(s.full_name.toLowerCase())).map((s) => s.full_name);

  return ok({
    lesson: {
      id: lesson.id, title: lesson.title, status: lesson.status, stage: lesson.stage, join_code: lesson.join_code,
    },
    clock: clock(lesson),
    totals: {
      joined: list.length,
      online: list.filter((p) => p.online).length,
      test_submitted: list.filter((p) => p.test_submitted).length,
      expected: (roster.data ?? []).length || null,
    },
    participants: list,
    not_joined: notJoined,
    queue: (queue.data ?? []).map((q) => ({ ...q, name: nameById.get(q.participant_id) ?? "?" })),
  });
});
