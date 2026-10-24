"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { sb, tapi, usePoll, STAGE, authMsg, envOk } from "@/lib/client";
import { Icon, Logo, Spinner } from "@/components/ui";

const STATUS: Record<string, string> = { draft: "Черновик", ready: "Готов", finished: "Завершён" };
const SUBJECTS = ["Математика", "Алгебра", "Геометрия", "Физика", "Химия", "Биология", "География", "История", "Информатика", "Русский язык", "Литература", "Английский язык"];
const DEMOS = [["Учитель математики", 0], ["Учитель физики", 1]] as const;

export default function Teacher() {
  const r = useRouter();
  const [session, setSession] = useState<any>(undefined);
  const [demoOpen, setDemoOpen] = useState(false); const [demoBusy, setDemoBusy] = useState<number | null>(null);
  const [email, setEmail] = useState(""); const [pass, setPass] = useState(""); const [show, setShow] = useState(false);
  const [subject, setSubject] = useState(""); const [title, setTitle] = useState(""); const [topic, setTopic] = useState(""); const [grade, setGrade] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session)).catch(() => setSession(null));
    const { data: s } = sb.auth.onAuthStateChange((_e, sess) => setSession(sess));
    fetch("/api/health").then((x) => x.json()).then((h) => setDemoOpen(!!h.demo_enabled)).catch(() => {});
    return () => s.subscription.unsubscribe();
  }, []);

  const lessons = usePoll(() => (session ? tapi("/api/lessons") : Promise.resolve(null)), 5000);

  async function signIn(em: string, pw: string) {
    if (!envOk) throw new Error("Не заданы ключи Supabase в .env.local. Откройте /api/health — там подсказка.");
    const { error } = await sb.auth.signInWithPassword({ email: em.trim().toLowerCase(), password: pw });
    if (error) throw new Error(authMsg(error.message));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try { await signIn(email, pass); } catch (x: any) { setErr(authMsg(x.message || "Ошибка входа")); }
    setBusy(false);
  }
  /** Демо: подставляет данные тестового аккаунта и сразу входит. */
  async function demo(i: number) {
    setErr(""); setDemoBusy(i);
    try {
      const res = await fetch("/api/auth/demo", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Демо-доступ недоступен");
      const a = j.accounts[i]; setEmail(a.email); setPass(a.password); setShow(true);
      await new Promise((ok) => setTimeout(ok, 700)); // чтобы было видно, как подставились данные
      await signIn(a.email, a.password);
    } catch (x: any) { setErr(authMsg(x.message || "Ошибка демо-входа")); }
    setDemoBusy(null);
  }
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const d = await tapi("/api/lessons", { subject, title, topic: topic || undefined, grade: grade || undefined });
      r.push(`/teacher/lessons/${d.lesson.id}`);
    } catch (x: any) { setErr(x.message); setBusy(false); }
  }

  if (session === undefined)
    return <><div className="top"><Logo /></div><div className="wrap narrow"><div className="skel" style={{ height: 320, marginTop: 30 }} /></div></>;

  if (!session)
    return (
      <>
        <div className="top"><Logo /></div>
        <form className="wrap narrow" onSubmit={submit}>
          <h1 style={{ marginTop: 26 }}>Кабинет учителя</h1>
          <p className="mut">Войдите, чтобы создавать уроки и запускать их для класса.</p>
          {!envOk && <div className="banner">Не найдены ключи Supabase. Заполните <b>.env.local</b> и перезапустите <b>npm run dev</b>.</div>}
          <div className="card glow">
            <label className="f">Почта<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="teacher@school.kg" /></label>
            <label className="f">Пароль
              <span className="pw"><input type={show ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)} required autoComplete="current-password" placeholder="Ваш пароль" />
                <button type="button" onClick={() => setShow(!show)}>{show ? "Скрыть" : "Показать"}</button></span>
            </label>
            {err && <div className="err">{err}</div>}
            <button className="btn p big" disabled={busy || demoBusy !== null}>{busy ? <><Spinner /> Входим…</> : "Войти"}</button>
            <p className="note" style={{ marginTop: 14, marginBottom: 0 }}><Icon name="lock" size={16} /> Аккаунты учителей создаёт администратор школы.</p>
            {demoOpen && (
              <div className="demo">
                <div className="mut small" style={{ marginBottom: 10 }}><Icon name="key" size={15} /> Демо-доступ для жюри — данные подставятся сами</div>
                <div className="row">
                  {DEMOS.map(([label, i]) => (
                    <button type="button" key={i} className="btn" disabled={busy || demoBusy !== null} onClick={() => demo(i)}>
                      {demoBusy === i ? <Spinner /> : <Icon name="sparkles" size={16} />} {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </form>
      </>
    );

  const fullName: string | undefined = session.user.user_metadata?.full_name;
  const list: any[] | undefined = lessons.data?.lessons;
  return (
    <>
      <div className="top">
        <Logo /><span className="sp" />
        <span className="small" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fullName ?? session.user.email}</span>
        <button className="btn" onClick={() => sb.auth.signOut()}>Выйти</button>
      </div>
      <div className="wrap">
        <h1>{fullName ? `Здравствуйте, ${fullName}` : "Мои уроки"}</h1>
        <p className="mut" style={{ marginBottom: 20 }}>Создайте урок — ИИ подготовит материалы, а вы запустите его для класса.</p>
        <div className="grid">
          <form className="card glow" onSubmit={create}>
            <h2>Новый урок</h2>
            <label className="f">Предмет<input value={subject} onChange={(e) => setSubject(e.target.value)} list="subjects" placeholder="Например, Алгебра" required maxLength={80} />
              <datalist id="subjects">{SUBJECTS.map((s) => <option key={s} value={s} />)}</datalist></label>
            <label className="f">Название урока<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Квадратные уравнения" required maxLength={160} /></label>
            <label className="f">Тема (можно позже загрузить PDF/PPTX)<input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Дискриминант и корни уравнения" /></label>
            <label className="f">Класс<input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="8 класс" /></label>
            {err && <div className="err">{err}</div>}
            <button className="btn p big" disabled={busy || !title.trim() || !subject.trim()}>{busy ? <><Spinner /> Создаём…</> : "Создать урок"}</button>
          </form>
          <div>
            {!list && !lessons.err && <><div className="skel" style={{ marginBottom: 12 }} /><div className="skel" /></>}
            {lessons.err && !list && <div className="err">{lessons.err}</div>}
            {list && !list.length && <div className="card empty"><span className="big"><Icon name="sparkles" size={40} /></span>Пока нет уроков.<br />Создайте первый слева.</div>}
            <div style={{ display: "grid", gap: 12 }}>
              {(list ?? []).map((l: any, i: number) => (
                <Link key={l.id} href={`/teacher/lessons/${l.id}`} className="lcard" style={{ animationDelay: `${i * 0.05}s` }}>
                  <div className="row"><b>{l.title}</b><span className="sp" />
                    <span className={`pill ${l.status === "live" ? "g live" : l.status === "ready" ? "g" : ""}`}>{l.status === "live" ? STAGE[l.stage] : STATUS[l.status]}</span></div>
                  <div className="row">{l.subject && <span className="subj">{l.subject}</span>}{l.topic && <span className="mut small">{l.topic}</span>}</div>
                  <span className="code">КОД · {l.join_code}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
