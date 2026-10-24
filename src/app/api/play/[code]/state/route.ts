import { admin } from "@/lib/supabase";
import { requireParticipant } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
import { clock, stageIndex } from "@/lib/lesson-state";
import { signMaterialImages } from "@/lib/storage";
import { teacherName } from "@/lib/teacher";

/**
 * Единственный источник данных для ученика. Клиент опрашивает его раз в 2–3 секунды.
 * Контент отдаётся ТОЛЬКО для текущего этапа, а ключ правильных ответов — только после теста.
 */
export const GET = handle<{ code: string }>(async (req, { params }) => {
  const { code } = await params;
  const { lesson, participant } = await requireParticipant(req, code);
  const db = admin();
  const c = clock(lesson);
  const base = {
    participant: { id: participant.id, name: participant.name },
    lesson: { title: lesson.title, subject: lesson.subject, teacher: await teacherName(lesson.teacher_id), status: lesson.status, stage: lesson.stage },
    clock: c,
  };

  if (lesson.status === "draft" || lesson.status === "ready" || !lesson.content) {
    return ok({ ...base, view: "waiting" });
  }
  const content = lesson.content;
  const stage = lesson.stage;
  const afterTest = stageIndex(stage) > stageIndex("test");

  if (stage === "explain") {
    return ok({
      images: (await signMaterialImages(lesson.images)).map((i) => i.url),
      formulas: content.formulas ?? [],
      ...base,
      view: "explain",
      explanation: content.explanation,
      examples: content.examples,
      simplified: lesson.simplified_explanation,
      extra_materials: content.extra_materials,
      extra_note: content.extra_note ?? null,
    });
  }

  if (stage === "test" || afterTest) {
    const [{ data: answers }, { data: sub }] = await Promise.all([
      db.from("test_answers").select("question_idx, choice, text_answer, is_correct").eq("participant_id", participant.id),
      db.from("test_submissions").select("submitted_at").eq("participant_id", participant.id).maybeSingle(),
    ]);

    if (stage === "test") {
      return ok({
        ...base,
        view: "test",
        submitted: !!sub,
        // правильные ответы НЕ отдаём
        questions: content.questions.map((q, idx) => ({ idx, q: q.q, options: q.options })),
        open_questions: content.open_questions.map((q, i) => ({ idx: 6 + i, q: q.q })),
        my_answers: (answers ?? []).map((a) => ({ idx: a.question_idx, choice: a.choice, text: a.text_answer })),
      });
    }

    // после теста — показываем ученику его результат и верные ответы
    const mine = new Map((answers ?? []).map((a) => [a.question_idx, a]));
    const review = {
      mc: content.questions.map((q, idx) => ({
        idx,
        q: q.q,
        options: q.options,
        my_choice: mine.get(idx)?.choice ?? null,
        correct: q.correct,
        is_correct: mine.get(idx)?.is_correct ?? false,
      })),
      score: (answers ?? []).filter((a) => a.is_correct).length,
      total: content.questions.length,
    };

    if (stage === "tasks") {
      const { data: photos } = await db.from("task_submissions").select("task_idx").eq("participant_id", participant.id);
      return ok({ ...base, view: "tasks", formulas: content.formulas ?? [], tasks: content.tasks, uploaded: (photos ?? []).map((p) => p.task_idx), test_review: review });
    }
    if (stage === "retell") {
      return ok({ ...base, view: "retell", prompt: content.retell_prompt, test_review: review });
    }
    if (stage === "board") {
      const { data: q } = await db.from("speak_queue").select("participant_id, status, created_at").eq("lesson_id", lesson.id).order("created_at");
      const waiting = (q ?? []).filter((x) => x.status === "waiting");
      const mineQ = (q ?? []).find((x) => x.participant_id === participant.id);
      return ok({
        ...base,
        view: "board",
        in_queue: !!mineQ,
        my_status: mineQ?.status ?? null,
        position: mineQ?.status === "waiting" ? waiting.findIndex((x) => x.participant_id === participant.id) + 1 : null,
        waiting_total: waiting.length,
        prompt: content.retell_prompt,
      });
    }
    return ok({ ...base, view: stage === "done" ? "done" : "review", test_review: review });
  }

  return ok({ ...base, view: "waiting" });
});
