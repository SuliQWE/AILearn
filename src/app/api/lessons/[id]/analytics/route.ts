import { admin } from "@/lib/supabase";
import { requireOwnedLesson } from "@/lib/auth";
import { handle, ok } from "@/lib/http";

const REPEAT_THRESHOLD = 0.6; // тема попадает в «повторить», если верно отвечено меньше 60%

/**
 * Итоговая аналитика. Блок auto — автоматический подсчёт теста (6 вопросов с вариантами).
 * Блок teacher — оценки учителя. Они намеренно не смешиваются.
 */
export const GET = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const { lesson } = await requireOwnedLesson(req, id);
  const db = admin();
  const questions = lesson.content?.questions ?? [];

  const [parts, answers, subs, photos, grades] = await Promise.all([
    db.from("lesson_participants").select("id, name").eq("lesson_id", id).order("name"),
    db.from("test_answers").select("participant_id, question_idx, kind, choice, is_correct").eq("lesson_id", id),
    db.from("test_submissions").select("participant_id").eq("lesson_id", id),
    db.from("task_submissions").select("participant_id, task_idx").eq("lesson_id", id),
    db.from("teacher_grades").select("participant_id, kind, score, comment").eq("lesson_id", id),
  ]);

  const participants = parts.data ?? [];
  const mc = (answers.data ?? []).filter((a) => a.kind === "mc");
  const submitted = new Set((subs.data ?? []).map((s) => s.participant_id));

  // По каждому вопросу: доля верных и самый частый неверный вариант
  const perQuestion = questions.map((q, idx) => {
    const list = mc.filter((a) => a.question_idx === idx);
    const correct = list.filter((a) => a.is_correct).length;
    const wrongCounts = [0, 0, 0, 0];
    for (const a of list) if (!a.is_correct && a.choice != null) wrongCounts[a.choice]++;
    const maxWrong = Math.max(...wrongCounts);
    return {
      idx,
      topic: q.topic,
      q: q.q,
      answered: list.length,
      correct,
      correct_rate: list.length ? correct / list.length : null,
      most_common_wrong: maxWrong > 0 ? { option: wrongCounts.indexOf(maxWrong), text: q.options[wrongCounts.indexOf(maxWrong)], count: maxWrong } : null,
    };
  });

  const byStudent = participants.map((p) => {
    const mine = mc.filter((a) => a.participant_id === p.id);
    const photoTasks = new Set((photos.data ?? []).filter((x) => x.participant_id === p.id).map((x) => x.task_idx));
    return {
      participant_id: p.id,
      name: p.name,
      test_submitted: submitted.has(p.id),
      auto_correct: mine.filter((a) => a.is_correct).length,
      auto_total: questions.length,
      tasks_photos: [0, 1].filter((t) => photoTasks.has(t)),
    };
  });

  // Темы для повторения
  const topicStats = new Map<string, { correct: number; total: number }>();
  for (const q of perQuestion) {
    const s = topicStats.get(q.topic) ?? { correct: 0, total: 0 };
    s.correct += q.correct;
    s.total += q.answered;
    topicStats.set(q.topic, s);
  }
  const topicsToRepeat = Array.from(topicStats.entries())
    .filter(([, s]) => s.total > 0 && s.correct / s.total < REPEAT_THRESHOLD)
    .map(([topic, s]) => ({ topic, correct_rate: s.correct / s.total }))
    .sort((a, b) => a.correct_rate - b.correct_rate);

  const rates = byStudent.filter((s) => s.test_submitted).map((s) => (s.auto_total ? s.auto_correct / s.auto_total : 0));

  return ok({
    lesson: { id: lesson.id, title: lesson.title, status: lesson.status },
    auto: {
      note: "Автоматический результат теста (только вопросы с вариантами ответа). Это не оценка учителя.",
      participants: participants.length,
      submitted: submitted.size,
      average_rate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
      per_question: perQuestion,
      per_student: byStudent,
      topics_to_repeat: topicsToRepeat,
    },
    incomplete: {
      no_test: byStudent.filter((s) => !s.test_submitted).map((s) => s.name),
      missing_task_photos: byStudent
        .filter((s) => s.tasks_photos.length < 2)
        .map((s) => ({ name: s.name, missing: [0, 1].filter((t) => !s.tasks_photos.includes(t)) })),
    },
    teacher: {
      note: "Оценки, выставленные учителем (отдельно от автоматического теста).",
      grades: grades.data ?? [],
    },
  });
});
