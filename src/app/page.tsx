"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon, Logo } from "@/components/ui";

const FEATURES: [string, string, string, string][] = [
  ["sparkles", "", "ИИ готовит урок", "Объяснение, тест и задачи за минуту — из темы или вашей презентации."],
  ["sigma", "v", "Формулы как в тетради", "Уравнения и правила с пошаговой записью, как писать от руки."],
  ["chat", "c", "Спросите у ИИ", "Ученик сам задаёт вопрос по теме и сразу получает понятный ответ."],
  ["timer", "o", "Таймеры и аналитика", "Время этапов задаёт учитель, а итоги показывают темы для повторения."],
];

export default function Home() {
  const r = useRouter();
  const [code, setCode] = useState("");
  const go = (e: React.FormEvent) => { e.preventDefault(); if (code.trim()) r.push(`/join/${code.trim().toUpperCase()}`); };
  return (
    <>
      <div className="top">
        <Logo /><span className="sp" />
        <Link className="btn" href="/teacher"><Icon name="user" size={17} /> Кабинет учителя</Link>
      </div>
      <div className="wrap">
        <section className="heroc hero">
          <span className="pill g live" style={{ marginTop: 18 }}>Новый формат урока</span>
          <h1>Урок, в котором <span className="grad">ИИ помогает каждому ученику</span></h1>
          <p className="lead">Введите код урока от учителя — и вы сразу в классе. Без регистрации, прямо с телефона.</p>
          <form className="card glow joinbox" onSubmit={go}>
            <label className="f" style={{ textAlign: "left" }}>Код урока
              <input className="codeinput" value={code} onChange={(e) => setCode(e.target.value)} placeholder="K7M2QX" maxLength={12} autoCapitalize="characters" autoComplete="off" autoFocus />
            </label>
            <button className="btn p big" disabled={!code.trim()}>Войти на урок <Icon name="arrow" size={18} /></button>
          </form>
        </section>

        <div className="feats">
          {FEATURES.map(([ic, tone, t, d], i) => (
            <div className="card" key={t} style={{ animationDelay: `${0.2 + i * 0.08}s` }}>
              <div className={`tile ${tone}`}><Icon name={ic} size={24} /></div>
              <h2 style={{ marginBottom: 6 }}>{t}</h2><p className="mut small" style={{ margin: 0 }}>{d}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
