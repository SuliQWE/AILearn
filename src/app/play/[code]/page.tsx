"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { sb, sapi, usePoll, useCountdown, fmt, STAGE } from "@/lib/client";
import { Logo, Spinner, Stepper, Ring } from "@/components/ui";
import { FormulaCard, Rich } from "@/components/rich";
import { AskAI } from "@/components/chat";

export default function Play() {
  const { code: raw } = useParams<{ code: string }>();
  const code = String(raw).toUpperCase();
  const r = useRouter();
  const st = usePoll(() => sapi(code, "state"), 2500, (e) => { if (e.status === 401) r.replace(`/join/${code}`); });
  const S = st.data; const left = useCountdown(S?.clock);
  const p = { S, code, left, reload: st.reload };
  const low = left != null && left <= 30 && S?.clock?.running;

  return (
    <>
      <div className="top">
        <Logo href="/" /><span className="sp" />
        {S && <span className="pill g">{STAGE[S.lesson.stage]}</span>}
        {left != null && <b className="small" style={{ color: low ? "var(--red)" : undefined, fontVariantNumeric: "tabular-nums" }}>{fmt(left)}</b>}
      </div>
      <div className="wrap narrow">
        {!S && (st.err ? <div className="err">{st.err}</div> : <><div className="skel" style={{ height: 70, marginBottom: 12 }} /><div className="skel" style={{ height: 200 }} /></>)}
        {S && <>
          <h1>{S.lesson.title}</h1>
          <p className="mut small">{S.lesson.subject && <span className="subj" style={{ marginRight: 8 }}>{S.lesson.subject}</span>}{S.lesson.teacher && <>Учитель: {S.lesson.teacher} · </>}{S.participant.name}{st.err && <span className="pill a" style={{ marginLeft: 8 }}>Нет связи, пробуем снова…</span>}{S.clock.paused && <span className="pill a" style={{ marginLeft: 8 }}>Пауза</span>}</p>
          {S.view !== "waiting" && <Stepper stage={S.lesson.stage} />}
          {left != null && S.clock.durationSec && ["test", "tasks", "retell"].includes(S.lesson.stage) && <div className="card row" style={{ gap: 18 }}><Ring left={left} total={S.clock.durationSec} low={!!low} /><div><h2 style={{ marginBottom: 4 }}>Осталось времени</h2><span className="mut small">Таймер ведёт сервер — он одинаков у всего класса.</span></div></div>}
          {S.view === "waiting" && <div className="card glow empty" style={{ padding: 30 }}><span className="big">⏳</span><h2>Урок скоро начнётся</h2><p className="mut">Оставайтесь на этой странице. Как только учитель запустит урок, всё появится само.</p></div>}
          {S.view === "explain" && <Explain {...p} />}
          {S.view === "test" && <Test {...p} />}
          {S.view === "tasks" && <Tasks {...p} />}
          {S.view === "retell" && <><div className="card"><h2>Подготовьте пересказ</h2><p className="prose">{S.prompt}</p><p className="mut small">Скоро учитель вызовет вас к доске.</p></div><Score R={S.test_review} /></>}
          {S.view === "board" && <Board {...p} />}
          {(S.view === "review" || S.view === "done") && <><div className="card"><h2>{S.view === "done" ? "Урок завершён" : "Учитель проверяет работы"}</h2><p className="mut">Ниже ваш результат теста.</p></div><Score R={S.test_review} full /></>}
        </>}
      </div>
    </>
  );
}

function Explain({ S, code }: any) {
  return (
    <>
      <div className="card"><h2>Объяснение</h2><div className="prose"><Rich text={S.explanation} /></div></div>
      {S.formulas?.length > 0 && <div className="card"><h2>Формулы и запись в тетрадь</h2><div className="papers">{S.formulas.map((f: any, i: number) => <FormulaCard key={i} f={f} i={i} />)}</div></div>}
      {S.images?.length > 0 && <div className="card"><h2>Формулы и слайды урока</h2><div className="shots">{S.images.map((u: string, i: number) => (
        <a key={i} href={u} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={u} alt={`Слайд ${i + 1}`} /></a>))}</div></div>}
      <div className="card"><h2>Примеры</h2>{S.examples.map((x: string, i: number) => <p key={i} style={{ margin: "6px 0" }}>• <Rich text={x} /></p>)}</div>
      {S.extra_materials?.map((m: any, i: number) => <div className="card" key={i}><h2>{m.title}</h2><div className="prose"><Rich text={m.text} /></div></div>)}
      <AskAI code={code} />
    </>
  );
}

function Test({ S, code, left }: any) {
  const [ans, setAns] = useState<Record<number, { choice?: number; text?: string }>>({});
  const init = useRef(false); const dirty = useRef(false); const auto = useRef(false);
  const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const done = S.submitted || sent; const frozen = done || S.clock.paused;

  useEffect(() => {
    if (init.current) return; init.current = true;
    const m: any = {}; for (const a of S.my_answers) m[a.idx] = { choice: a.choice ?? undefined, text: a.text ?? undefined }; setAns(m);
  }, [S.my_answers]);

  const payload = () => Object.entries(ans).map(([i, v]) => ({ idx: Number(i), ...(Number(i) < 6 ? { choice: v.choice } : { text: v.text ?? "" }) })).filter((a: any) => Number(a.idx) >= 6 || a.choice != null);

  async function send(final: boolean) {
    if (done) return; setBusy(final); setErr("");
    try { const res = await sapi(code, "answers", { answers: payload(), final }); dirty.current = false; if (final || res.already_submitted) setSent(true); }
    catch (e: any) { setErr(e.status === 409 ? e.message : "Нет связи — ответы отправятся, как только появится сеть"); } finally { setBusy(false); }
  }
  const sendRef = useRef(send); sendRef.current = send;

  useEffect(() => { const t = setInterval(() => { if (dirty.current && !done) sendRef.current(false); }, 3000); return () => clearInterval(t); }, [done]);
  useEffect(() => { if (left === 0 && !done && !auto.current) { auto.current = true; sendRef.current(true); } }, [left, done]);

  const set = (i: number, v: any) => { dirty.current = true; setAns((a) => ({ ...a, [i]: { ...a[i], ...v } })); };
  if (done) return <div className="card glow empty"><span className="big">✅</span><h2>Тест сдан</h2><p className="mut">Ждите, пока учитель перейдёт к следующему этапу. Результат появится позже.</p></div>;

  return (
    <>
      {S.questions.map((q: any) => (
        <div className="card" key={q.idx}>
          <h2>{q.idx + 1}. <Rich text={q.q} /></h2>
          {q.options.map((o: string, j: number) => (
            <label key={j} className={`opt ${ans[q.idx]?.choice === j ? "on" : ""}`}>
              <input type="radio" name={`q${q.idx}`} checked={ans[q.idx]?.choice === j} disabled={frozen} onChange={() => set(q.idx, { choice: j })} /><span><Rich text={o} /></span>
            </label>
          ))}
        </div>
      ))}
      {S.open_questions.map((q: any) => (
        <div className="card" key={q.idx}><h2>{q.idx + 1}. <Rich text={q.q} /></h2>
          <textarea value={ans[q.idx]?.text ?? ""} disabled={frozen} onChange={(e) => set(q.idx, { text: e.target.value })} placeholder="Ваш ответ" maxLength={4000} /></div>
      ))}
      {err && <div className="err">{err}</div>}
      <button className="btn p big" disabled={busy || frozen} onClick={() => send(true)}>{busy ? <><Spinner /> Отправляем…</> : "Сдать тест"}</button>
    </>
  );
}

function Tasks({ S, code, reload }: any) {
  const [busy, setBusy] = useState<number | null>(null); const [err, setErr] = useState("");
  async function upload(i: number, f: File) {
    setBusy(i); setErr("");
    try {
      let ext = (f.name.split(".").pop() ?? "jpg").toLowerCase(); if (!["jpg", "jpeg", "png", "webp", "heic"].includes(ext)) ext = "jpg";
      const up = await sapi(code, "upload-url", { task_idx: i, ext });
      const r = await sb.storage.from("submissions").uploadToSignedUrl(up.path, up.token, f, { contentType: f.type || "image/jpeg" });
      if (r.error) throw new Error("Фото не загрузилось. Проверьте связь и попробуйте ещё раз");
      await sapi(code, "upload-confirm", { path: up.path });
      await reload();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }
  return (
    <>
      <p className="mut">Решите задачи на бумаге и сфотографируйте решение. До 3 фото на задачу.</p>
      {S.tasks.map((t: any, i: number) => {
        const n = S.uploaded.filter((x: number) => x === i).length;
        return (
          <div className="card" key={i}>
            <h2>Задача {i + 1}. {t.title}</h2><p className="prose"><Rich text={t.text} /></p>
            <div className="row"><label className={`btn ${n ? "" : "p"}`} style={{ display: "inline-flex", alignItems: "center", opacity: busy === i || n >= 3 || S.clock.paused ? 0.5 : 1 }}>
              {busy === i ? "Загружаем…" : n ? "Добавить ещё фото" : "Сфотографировать решение"}
              <input type="file" accept="image/*" capture="environment" hidden disabled={busy !== null || n >= 3 || S.clock.paused} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(i, f); }} />
            </label>{n > 0 && <span className="pill g">Загружено: {n}</span>}</div>
          </div>
        );
      })}
      {err && <div className="err">{err}</div>}
      {S.formulas?.length > 0 && <div className="card"><h2>Формулы-подсказки</h2><div className="papers">{S.formulas.map((f: any, i: number) => <FormulaCard key={i} f={f} i={i} />)}</div></div>}
      <Score R={S.test_review} />
    </>
  );
}

function Board({ S, code, reload }: any) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function join() { setBusy(true); setErr(""); try { await sapi(code, "queue", {}); await reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  return (
    <div className="card">
      <h2>Ответ у доски</h2><p className="prose mut">{S.prompt}</p>
      {!S.in_queue && <button className="btn p big" disabled={busy} onClick={join}>Хочу ответить</button>}
      {S.my_status === "waiting" && <p>Вы в очереди. Ваше место: <b>{S.position}</b> из {S.waiting_total}</p>}
      {S.my_status === "called" && <p className="pill g">Учитель вызывает вас к доске</p>}
      {S.my_status === "done" && <p className="pill g">Вы ответили. Спасибо!</p>}
      {err && <div className="err">{err}</div>}
    </div>
  );
}

function Score({ R, full }: any) {
  if (!R) return null;
  return (
    <div className="card">
      <h2>Результат теста: {R.score} из {R.total}</h2>
      {full && R.mc.map((q: any) => (
        <div key={q.idx} style={{ marginBottom: 12 }}>
          <div className="small">{q.idx + 1}. {q.q}</div>
          {q.options.map((o: string, j: number) => <div key={j} className={`opt ${j === q.correct ? "ok" : j === q.my_choice ? "bad" : ""}`} style={{ padding: "6px 10px", marginBottom: 4 }}>{o}{j === q.correct ? " ✓" : j === q.my_choice ? " — ваш ответ" : ""}</div>)}
        </div>
      ))}
    </div>
  );
}
