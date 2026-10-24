"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { sb, tapi, usePoll, useCountdown, fmt, STAGE, ORDER } from "@/lib/client";
import { Icon, Logo, Ring, Spinner, Stepper } from "@/components/ui";
import { FormulaCard, Rich } from "@/components/rich";

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState("mat");
  const lesson = usePoll(() => tapi(`/api/lessons/${id}`), 4000);
  const L = lesson.data?.lesson;
  const tabs: [string, string][] = [["mat", "Материалы"], ["live", "Урок"], ["works", "Работы"], ["res", "Итоги"]];
  return (
    <>
      <div className="top"><Logo href="/teacher" /><span className="crumb">/</span><span>{L?.title ?? "…"}</span>{L?.subject && <span className="subj">{L.subject}</span>}<span className="sp" /><Link className="btn" href="/teacher">← Все уроки</Link></div>
      <div className="wrap">
        <div className="tabs">{tabs.map(([k, n]) => <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{n}</button>)}</div>
        {lesson.err && !L && <div className="err">{lesson.err}</div>}
        {!L && !lesson.err && <div className="skel" style={{ height: 220 }} />}
        {L && tab === "mat" && <Materials id={id} L={L} imgs={lesson.data?.image_urls ?? []} reload={lesson.reload} />}
        {L && tab === "live" && <Live id={id} L={L} reload={lesson.reload} />}
        {L && tab === "works" && <Works id={id} L={L} />}
        {L && tab === "res" && <Results id={id} />}
      </div>
    </>
  );
}

const DUR: [string, string][] = [["explain", "Объяснение"], ["test", "Мини-тест"], ["tasks", "Задачи"], ["retell", "Пересказ"], ["board", "Ответ у доски"]];
const DEF: Record<string, number> = { explain: 0, test: 5, tasks: 15, retell: 3, board: 0 };

function Materials({ id, L, imgs, reload }: any) {
  const [subject, setSubject] = useState(L.subject ?? ""); const [topic, setTopic] = useState(L.topic ?? ""); const [grade, setGrade] = useState(L.grade ?? "");
  const [wishes, setWishes] = useState(L.instructions ?? "");
  const [dur, setDur] = useState<Record<string, number>>(() => {
    const o: Record<string, number> = {};
    for (const [k] of DUR) { const v = L.stage_durations?.[k]; o[k] = v === undefined ? DEF[k] : v == null ? 0 : Math.round(v / 60); }
    return o;
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(""); const [msg, setMsg] = useState(""); const [saved, setSaved] = useState("");
  const [expl, setExpl] = useState(L.content?.explanation ?? "");
  const C = L.content;
  useEffect(() => { if (C) setExpl(C.explanation); }, [C?.explanation]);
  const locked = L.status === "live" || L.status === "finished";
  const flash = (t: string) => { setSaved(t); setTimeout(() => setSaved(""), 2200); };

  async function generate() {
    setBusy("gen"); setMsg("");
    try {
      let material_path: string | undefined;
      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (!["pdf", "pptx", "txt", "md"].includes(ext)) throw new Error("Поддерживаются PDF, PPTX, TXT");
        const up = await tapi(`/api/lessons/${id}/material-upload`, { ext });
        const r = await sb.storage.from("materials").uploadToSignedUrl(up.path, up.token, file);
        if (r.error) throw new Error("Не удалось загрузить файл. Попробуйте ещё раз");
        material_path = up.path;
      }
      await tapi(`/api/lessons/${id}/generate`, { topic: topic || undefined, grade: grade || undefined, subject: subject || undefined, instructions: wishes, material_path });
      await reload();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(""); }
  }
  async function saveSettings() {
    setBusy("set"); setMsg("");
    try {
      await tapi(`/api/lessons/${id}`, { ...(subject.trim() ? { subject } : {}), instructions: wishes, durations: dur }, "PATCH");
      await reload(); flash("Настройки сохранены");
    } catch (e: any) { setMsg(e.message); } finally { setBusy(""); }
  }
  async function save() {
    setBusy("save"); setMsg("");
    try { await tapi(`/api/lessons/${id}`, { content: { ...C, explanation: expl } }, "PATCH"); await reload(); flash("Сохранено"); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(""); }
  }
  async function addImages(files: FileList | null) {
    if (!files?.length) return;
    setBusy("img"); setMsg("");
    try {
      const paths: string[] = [...(L.images ?? [])];
      for (const f of Array.from(files)) {
        if (paths.length >= 8) throw new Error("Можно загрузить до 8 картинок");
        const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
        if (!["png", "jpg", "jpeg", "webp"].includes(ext)) throw new Error("Подходят PNG, JPG или WEBP");
        if (f.size > 8 * 1024 * 1024) throw new Error("Картинка больше 8 МБ");
        const up = await tapi(`/api/lessons/${id}/material-upload`, { ext });
        const r = await sb.storage.from("materials").uploadToSignedUrl(up.path, up.token, f, { contentType: f.type || "image/png" });
        if (r.error) throw new Error("Не удалось загрузить картинку. Попробуйте ещё раз");
        paths.push(up.path);
      }
      await tapi(`/api/lessons/${id}`, { images: paths }, "PATCH"); await reload(); flash("Картинки добавлены");
    } catch (e: any) { setMsg(e.message); } finally { setBusy(""); }
  }
  async function removeImage(path: string) {
    try { await tapi(`/api/lessons/${id}`, { images: (L.images ?? []).filter((x: string) => x !== path) }, "PATCH"); await reload(); } catch (e: any) { setMsg(e.message); }
  }

  return (
    <>
      <div className="card">
        <h2>Источник урока</h2>
        <div className="grid" style={{ marginBottom: 0 }}>
          <label className="f">Предмет<input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={locked} placeholder="Алгебра" /></label>
          <label className="f">Класс<input value={grade} onChange={(e) => setGrade(e.target.value)} disabled={locked} placeholder="8 класс" /></label>
        </div>
        <label className="f">Тема<input value={topic} onChange={(e) => setTopic(e.target.value)} disabled={locked} placeholder="О чём урок" /></label>
        <label className="f">Описание для ИИ — что учесть при создании материалов (необязательно)
          <textarea style={{ minHeight: 90 }} value={wishes} onChange={(e) => setWishes(e.target.value)} disabled={locked} maxLength={2000}
            placeholder="Например: сделай упор на решение через дискриминант, добавь задачи с параметром, объясняй без сложных терминов…" /></label>
        <label className="f">Файл PDF / PPTX (необязательно)<input type="file" accept=".pdf,.pptx,.txt,.md" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={locked} /></label>
        <div className="row">
          <button className="btn p" disabled={!!busy || locked || (!topic && !file)} onClick={generate}>{busy === "gen" ? <><Spinner /> ИИ готовит урок… до минуты</> : <><Icon name="sparkles" size={17} /> {C ? "Сгенерировать заново" : "Сгенерировать материалы"}</>}</button>
          {msg && <span className="err" style={{ margin: 0 }}>{msg}</span>}
          {saved && <span className="pill g">{saved}</span>}
        </div>
      </div>

      <div className="card">
        <h2>Время этапов, минуты</h2>
        <p className="mut small" style={{ marginTop: -6 }}>0 — без таймера (учитель переключает этап сам). Время можно продлить прямо во время урока.</p>
        <div className="durs">
          {DUR.map(([k, n]) => (
            <label key={k}>{n}<input type="number" min={0} max={180} value={dur[k]} disabled={locked}
              onChange={(e) => setDur({ ...dur, [k]: Math.max(0, Math.min(180, Math.floor(Number(e.target.value) || 0))) })} /></label>
          ))}
        </div>
        <div className="row" style={{ marginTop: 14 }}><button className="btn" disabled={!!busy || locked} onClick={saveSettings}>{busy === "set" ? <Spinner /> : null} Сохранить настройки</button></div>
      </div>

      <div className="card">
        <h2><Icon name="image" size={18} /> Фото формул и слайдов</h2>
        <p className="mut small" style={{ marginTop: -6 }}>Загрузите скриншот слайда или фото формулы — ученики увидят его в объяснении как есть. ИИ также сам добавит формулы с записью «как в тетради».</p>
        <input type="file" accept=".png,.jpg,.jpeg,.webp" multiple disabled={locked || busy === "img"} onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} />
        {busy === "img" && <p className="mut small"><Spinner /> Загружаем…</p>}
        {imgs.length > 0 && <div className="uploads">{imgs.map((i: any) => (
          <div className="up" key={i.path}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={i.url} alt="Формула или слайд" />
            {!locked && <button onClick={() => removeImage(i.path)} aria-label="Удалить"><Icon name="trash" size={14} /></button>}</div>
        ))}</div>}
      </div>

      {C && (
        <>
          <div className="card">
            <h2>Объяснение <span className="mut small">— можно отредактировать до запуска; формулы пишутся между $…$</span></h2>
            <textarea style={{ minHeight: 200 }} value={expl} onChange={(e) => setExpl(e.target.value)} disabled={locked} />
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" disabled={locked || busy === "save" || expl === C.explanation} onClick={save}>Сохранить</button>
            </div>
            <h2 style={{ marginTop: 18 }}>Примеры</h2>
            {C.examples.map((x: string, i: number) => <p key={i} className="mut" style={{ margin: "4px 0" }}>• <Rich text={x} /></p>)}
          </div>
          {C.formulas?.length > 0 && (
            <div className="card">
              <h2>Формулы и запись в тетрадь</h2>
              <div className="papers">{C.formulas.map((f: any, i: number) => <FormulaCard key={i} f={f} i={i} />)}</div>
            </div>
          )}
          <div className="card">
            <h2>Тест: 6 вопросов с вариантами</h2>
            {C.questions.map((q: any, i: number) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div>{i + 1}. <Rich text={q.q} /> <span className="pill">{q.topic}</span></div>
                {q.options.map((o: string, j: number) => <div key={j} className={q.correct === j ? "" : "mut"} style={{ marginLeft: 16, color: q.correct === j ? "var(--green)" : undefined }}>{"ABCD"[j]}) <Rich text={o} />{q.correct === j ? " ✓" : ""}</div>)}
              </div>
            ))}
            <h2>Открытые вопросы</h2>
            {C.open_questions.map((q: any, i: number) => <p key={i} style={{ margin: "6px 0" }}>{i + 1}. <Rich text={q.q} />{q.hint && <span className="mut small"> — {q.hint}</span>}</p>)}
          </div>
          <div className="card">
            <h2>Практические задачи</h2>
            {C.tasks.map((t: any, i: number) => <p key={i}><b>{t.title}.</b> <Rich text={t.text} /></p>)}
            <h2 style={{ marginTop: 14 }}>Пересказ</h2><p className="mut">{C.retell_prompt}</p>
            {C.extra_note && <p className="pill a" style={{ whiteSpace: "normal" }}>{C.extra_note}</p>}
          </div>
        </>
      )}
    </>
  );
}

function Live({ id, L, reload }: any) {
  const st = usePoll(() => tapi(`/api/lessons/${id}/state`), 2000);
  const [qr, setQr] = useState<any>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const clock = st.data?.clock; const left = useCountdown(clock);
  useEffect(() => { tapi(`/api/lessons/${id}/qr`).then(setQr).catch(() => {}); }, [id]);

  async function ctl(action: string) {
    setBusy(true); setErr("");
    try { await tapi(`/api/lessons/${id}/control`, { action }); await Promise.all([st.reload(), reload()]); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function queue(participantId: string, status: string) {
    try { await tapi(`/api/lessons/${id}/queue`, { participantId, status }); st.reload(); } catch (e: any) { setErr(e.message); }
  }
  const S = st.data; const live = L.status === "live"; const next = ORDER[ORDER.indexOf(L.stage) + 1];
  const low = left != null && left <= 30 && live;

  return (
    <>
      {(live || L.status === "finished") && <Stepper stage={L.stage} />}
      <div className="grid">
        <div className="card">
          <h2>Вход для учеников</h2>
          {qr ? (
            <div className="row" style={{ alignItems: "flex-start" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="qr" src={qr.qr} alt="QR-код для входа в урок" />
              <div><div className="mut small">Код урока</div><div className="timer grad" style={{ fontSize: 34, letterSpacing: ".12em" }}>{qr.code}</div>
                <div className="small mut" style={{ wordBreak: "break-all", maxWidth: 220 }}>{qr.url}</div>
                <CopyBtn text={qr.url} /></div>
            </div>
          ) : <div className="mut">Загрузка…</div>}
        </div>
        <div className="card">
          <h2>Этап: {L.status === "live" || L.status === "finished" ? STAGE[L.stage] : "урок не запущен"} {live && <span className="pill g live">идёт</span>}</h2>
          <div className="row" style={{ gap: 18 }}>
            {left != null && clock?.durationSec ? <Ring left={left} total={clock.durationSec} low={!!low} /> : <div className={`timer ${low ? "low" : ""}`}>{left != null ? fmt(left) : live ? "без таймера" : "—"}</div>}
            {clock?.paused && <span className="pill a">Пауза</span>}
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            {L.status === "ready" && <button className="btn p" disabled={busy} onClick={() => ctl("start")}>Запустить урок</button>}
            {L.status === "draft" && <span className="mut">Сначала сгенерируйте материалы на вкладке «Материалы».</span>}
            {live && <>
              <button className="btn" disabled={busy} onClick={() => ctl(clock?.paused ? "resume" : "pause")}>{clock?.paused ? "Продолжить" : "Пауза"}</button>
              {clock?.durationSec != null && <button className="btn" disabled={busy} onClick={() => ctl("extend")}>+1 мин</button>}
              <button className="btn p" disabled={busy} onClick={() => ctl("next")}>{next === "done" ? "Завершить урок" : `Дальше: ${STAGE[next]}`}</button>
            </>}
          </div>
          {err && <div className="err">{err}</div>}
        </div>
      </div>
      {S && (
        <div className="card">
          <h2>Ученики: {S.totals.joined}{S.totals.expected ? ` из ${S.totals.expected}` : ""} · в сети {S.totals.online} · тест сдали {S.totals.test_submitted}</h2>
          <div style={{ overflowX: "auto" }}><table>
            <thead><tr><th>Имя</th><th>Тест</th><th>Фото решений</th></tr></thead>
            <tbody>
              {S.participants.map((p: any) => (
                <tr key={p.id}>
                  <td><span className={`dot ${p.online ? "on" : ""}`} /> {p.name}</td>
                  <td>{p.test_submitted ? <span className="pill g">сдан</span> : p.test_answered ? <span className="pill a">{p.test_answered}/8</span> : <span className="pill">—</span>}</td>
                  <td>{p.tasks_with_photo.length ? <span className="pill g">{p.tasks_with_photo.length}/2</span> : <span className="pill">—</span>}</td>
                </tr>
              ))}
              {!S.participants.length && <tr><td colSpan={3} className="mut">Пока никто не вошёл. Покажите QR-код классу.</td></tr>}
            </tbody>
          </table></div>
          {S.not_joined.length > 0 && <p className="small mut">Не вошли: {S.not_joined.join(", ")}</p>}
        </div>
      )}
      {S && S.queue.length > 0 && (
        <div className="card">
          <h2>Очередь к доске</h2>
          {S.queue.map((q: any) => (
            <div key={q.id} className="row" style={{ padding: "6px 0" }}>
              <span style={{ minWidth: 160 }}>{q.name}</span><span className={`pill ${q.status === "called" ? "g" : ""}`}>{{ waiting: "ждёт", called: "у доски", done: "ответил", skipped: "пропущен" }[q.status as string]}</span><span className="sp" />
              {q.status !== "called" && q.status !== "done" && <button className="btn" onClick={() => queue(q.participant_id, "called")}>Вызвать</button>}
              {q.status === "called" && <button className="btn p" onClick={() => queue(q.participant_id, "done")}>Ответил</button>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Works({ id, L }: any) {
  const d = usePoll(() => tapi(`/api/lessons/${id}/submissions`), 5000);
  const [msg, setMsg] = useState("");
  const KINDS: [string, string][] = [["written", "Письменная"], ["oral", "Устный ответ"], ["open_q", "Открытые вопросы"]];
  async function grade(participantId: string, kind: string, score: number) {
    try { await tapi(`/api/lessons/${id}/grades`, { participantId, kind, score }, "PUT"); setMsg(""); d.reload(); } catch (e: any) { setMsg(e.message); }
  }
  const openQs = L.content?.open_questions ?? [];
  return (
    <>
      <p className="mut">Фото сохраняются только для вас. ИИ их не проверяет, оценки выставляете вы.</p>
      {msg && <div className="err">{msg}</div>}
      {(d.data?.students ?? []).map((s: any) => (
        <div className="card" key={s.participant_id}>
          <h2>{s.name}</h2>
          {s.answers.filter((a: any) => a.kind === "open" && a.text_answer).map((a: any) => (
            <p key={a.question_idx} className="small"><span className="mut">{openQs[a.question_idx - 6]?.q}</span><br />{a.text_answer}</p>
          ))}
          {s.photos.length ? <div className="thumbs">{s.photos.map((p: any) => p.url && (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.url} alt={`Задача ${p.task_idx + 1}`} /></a>
          ))}</div> : <span className="mut small">Фото не загружены</span>}
          <div className="row" style={{ marginTop: 12 }}>
            {KINDS.map(([k, n]) => {
              const cur = s.teacher_grades.find((g: any) => g.kind === k)?.score;
              return <label key={k} className="small mut">{n}
                <select value={cur ?? ""} onChange={(e) => e.target.value && grade(s.participant_id, k, Number(e.target.value))} style={{ marginLeft: 6, width: 84 }}>
                  <option value="">—</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
                </select></label>;
            })}
          </div>
        </div>
      ))}
      {d.data && !d.data.students.length && <div className="card mut">Пока нет работ.</div>}
    </>
  );
}

function Results({ id }: any) {
  const d = usePoll(() => tapi(`/api/lessons/${id}/analytics`), 6000);
  const A = d.data?.auto; const pct = (x: number | null) => (x == null ? "—" : Math.round(x * 100) + "%");
  if (!A) return <div className="mut">{d.err || "Загрузка…"}</div>;
  return (
    <>
      <div className="grid">
        <div className="card"><div className="mut small">Сдали тест</div><div className="timer">{A.submitted}/{A.participants}</div></div>
        <div className="card"><div className="mut small">Средний результат теста (авто)</div><div className="timer">{pct(A.average_rate)}</div></div>
      </div>
      <div className="card">
        <h2>Вопросы теста</h2>
        <p className="small mut">{A.note}</p>
        {A.per_question.map((q: any) => (
          <div key={q.idx} style={{ marginBottom: 12 }}>
            <div className="small">{q.idx + 1}. {q.q}</div>
            <div className="row"><div className="bar" style={{ flex: 1 }}><i style={{ width: pct(q.correct_rate) === "—" ? 0 : pct(q.correct_rate) }} /></div><span className="small">{pct(q.correct_rate)}</span></div>
            {q.most_common_wrong && <div className="small mut">Частая ошибка: «{q.most_common_wrong.text}» ({q.most_common_wrong.count})</div>}
          </div>
        ))}
      </div>
      <div className="grid">
        <div className="card"><h2>Темы для повторения</h2>
          {A.topics_to_repeat.length ? A.topics_to_repeat.map((t: any) => <div key={t.topic}>{t.topic} <span className="pill r">{pct(t.correct_rate)}</span></div>) : <span className="mut">Все темы усвоены ≥ 60%</span>}</div>
        <div className="card"><h2>Не завершили</h2>
          {d.data.incomplete.no_test.length > 0 && <p className="small">Без теста: {d.data.incomplete.no_test.join(", ")}</p>}
          {d.data.incomplete.missing_task_photos.length > 0 && <p className="small">Без фото задач: {d.data.incomplete.missing_task_photos.map((x: any) => x.name).join(", ")}</p>}
          {!d.data.incomplete.no_test.length && !d.data.incomplete.missing_task_photos.length && <span className="mut">Нет</span>}</div>
      </div>
      <div className="card">
        <h2>Оценки учителя</h2><p className="small mut">{d.data.teacher.note}</p>
        {d.data.teacher.grades.length ? <table><tbody>{d.data.teacher.grades.map((g: any, i: number) => {
          const n = A.per_student.find((s: any) => s.participant_id === g.participant_id)?.name;
          return <tr key={i}><td>{n}</td><td>{{ written: "Письменная", oral: "Устный ответ", open_q: "Открытые вопросы" }[g.kind as string]}</td><td>{g.score}</td></tr>;
        })}</tbody></table> : <span className="mut">Оценок пока нет.</span>}
      </div>
    </>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return <button className="btn" style={{ marginTop: 8 }} onClick={() => { navigator.clipboard?.writeText(text); setOk(true); setTimeout(() => setOk(false), 1600); }}>{ok ? "✓ Скопировано" : "Скопировать ссылку"}</button>;
}
