"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, Logo, Spinner } from "@/components/ui";

type Info = { title: string; subject: string | null; closed: boolean } | { error: string } | null;

export default function Join() {
  const { code } = useParams<{ code: string }>();
  const r = useRouter();
  const C = String(code).toUpperCase();
  const [info, setInfo] = useState<Info>(null);
  const [name, setName] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => { if (localStorage.getItem("pt:" + C)) { r.replace(`/play/${C}`); return; }
    fetch(`/api/join?code=${encodeURIComponent(C)}`).then(async (res) => { const j = await res.json().catch(() => ({})); setInfo(res.ok ? j : { error: j.error || "Не удалось проверить код" }); })
      .catch(() => setInfo({ error: "Нет связи с сервером. Проверьте интернет" })); }, [C, r]);

  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const res = await fetch("/api/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: C, name }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.details?.[0] ? String(j.details[0]).replace(/^name:\s*/, "") : j.error || "Не удалось войти");
      localStorage.setItem("pt:" + C, j.token); localStorage.setItem("pn:" + C, j.participant.name);
      r.push(`/play/${C}`);
    } catch (x: any) { setErr(x.message === "Failed to fetch" ? "Нет связи с сервером. Проверьте интернет" : x.message); setBusy(false); }
  }

  const bad = info && "error" in info ? info.error : info && "closed" in info && info.closed ? "Урок завершён — вход по этому коду закрыт." : "";
  return (
    <>
      <div className="top"><Logo /></div>
      <div className="wrap narrow">
        {!info && <div className="skel" style={{ height: 260, marginTop: 30 }} />}
        {info && bad && (
          <div className="card glow empty" style={{ marginTop: 30, padding: 34 }}>
            <span className="big"><Icon name="lock" size={44} /></span>
            <h1 style={{ fontSize: 22 }}>{"error" in info ? "Не получилось войти" : "Урок завершён"}</h1>
            <p className="mut">{bad}</p>
            <Link className="btn p" href="/">Ввести другой код</Link>
          </div>
        )}
        {info && !bad && "title" in info && (
          <form onSubmit={go}>
            <h1 style={{ marginTop: 26 }}>Вход в урок</h1>
            <p className="mut">{info.subject && <span className="subj" style={{ marginRight: 8 }}>{info.subject}</span>}{info.title} · <span className="pill g" style={{ letterSpacing: ".15em" }}>{C}</span></p>
            <div className="card glow">
              <label className="f">Ваше имя и фамилия<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Айбек Касымов" autoFocus required minLength={2} maxLength={60} autoComplete="name" /></label>
              {err && <div className="err">{err}</div>}
              <button className="btn p big" disabled={busy || name.trim().length < 2}>{busy ? <><Spinner /> Входим…</> : <>Войти <Icon name="arrow" size={18} /></>}</button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
