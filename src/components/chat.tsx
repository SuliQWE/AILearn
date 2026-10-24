"use client";
import { useEffect, useRef, useState } from "react";
import { sapi } from "@/lib/client";
import { Icon } from "@/components/ui";
import { Rich } from "@/components/rich";

interface Msg { role: "user" | "ai"; text: string }
const IDEAS = ["Объясни проще", "Приведи пример", "Зачем это нужно в жизни?", "Где чаще всего ошибаются?"];

/** Ученик сам задаёт вопрос по теме — ИИ отвечает. */
export function AskAI({ code }: { code: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, busy]);

  async function ask(text: string) {
    const question = text.trim();
    if (question.length < 2 || busy) return;
    const history = msgs.slice(-6);
    setMsgs((m) => [...m, { role: "user", text: question }]); setQ(""); setBusy(true); setErr("");
    try {
      const r = await sapi(code, "ask", { question, history });
      setMsgs((m) => [...m, { role: "ai", text: r.answer }]);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card glow chat">
      <h2><Icon name="chat" size={18} /> Спросите ИИ по теме урока</h2>
      {!msgs.length && <p className="mut small" style={{ marginTop: -4 }}>Что-то не понятно? Напишите вопрос своими словами — ИИ объяснит.</p>}
      <div className="msgs">
        {msgs.map((m, i) => <div key={i} className={`msg ${m.role}`}><Rich text={m.text} /></div>)}
        {busy && <div className="msg ai typing"><i /><i /><i /></div>}
        <div ref={end} />
      </div>
      {!msgs.length && <div className="row" style={{ marginBottom: 10 }}>{IDEAS.map((t) => <button key={t} type="button" className="chip btn-chip" onClick={() => ask(t)} disabled={busy}>{t}</button>)}</div>}
      {err && <div className="err">{err}</div>}
      <form className="askbar" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <textarea rows={1} value={q} maxLength={500} placeholder="Например: почему дискриминант может быть отрицательным?" onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q); } }} />
        <button className="btn p" disabled={busy || q.trim().length < 2} aria-label="Отправить"><Icon name="send" size={18} /></button>
      </form>
    </div>
  );
}
