"use client";
import Link from "next/link";
import { ORDER, STAGE, fmt } from "@/lib/client";

export function Logo({ href = "/" }: { href?: string }) {
  return <Link href={href} className="logo"><i />AI Lesson</Link>;
}

const PATHS: Record<string, React.ReactNode> = {
  sparkles: <><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 3v4M17 5h4M5 17v4M3 19h4" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h3M20 17v4" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  sigma: <path d="M18 5H6l6 7-6 7h12" />,
  chat: <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />,
  send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></>,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3" /></>,
};

/** Набор линейных иконок (в стиле Lucide) — без внешних зависимостей. */
export function Icon({ name, size = 20 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

export function Spinner() {
  return <span className="spin" aria-hidden />;
}

/** Полоска этапов урока: пройденные — зелёные, текущий — пульсирует. */
export function Stepper({ stage }: { stage: string }) {
  const cur = ORDER.indexOf(stage);
  return (
    <div className="stepper" role="list" aria-label="Этапы урока">
      {ORDER.map((s, k) => (
        <div key={s} role="listitem" className={`st ${k < cur ? "done" : k === cur ? "cur" : ""}`}>
          <span className="n">{k < cur ? "✓" : k + 1}</span>
          <span className="l">{STAGE[s]}</span>
        </div>
      ))}
    </div>
  );
}

/** Круговой таймер. total — длительность этапа в секундах (если нет — рисуем просто текст). */
export function Ring({ left, total, low }: { left: number | null; total: number | null; low?: boolean }) {
  if (left == null) return null;
  const R = 52, C = 2 * Math.PI * R;
  const p = total ? Math.min(1, Math.max(0, left / total)) : 0;
  return (
    <div className={`ring ${low ? "low" : ""}`} role="timer" aria-label={`Осталось ${fmt(left)}`}>
      <svg viewBox="0 0 120 120">
        <defs>
          <linearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3ecf8e" /><stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <circle className="tr" cx="60" cy="60" r={R} />
        <circle className="pr" cx="60" cy="60" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - p)} />
      </svg>
      <b>{fmt(left)}</b>
    </div>
  );
}
