"use client";
import katex from "katex";
import { useMemo } from "react";

function toHtml(tex: string, display: boolean): string | null {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: "ignore" });
  } catch {
    return null;
  }
}

/** Одна формула в LaTeX. KaTeX экранирует вывод, trust выключен — XSS невозможен. */
export function Tex({ latex, display }: { latex: string; display?: boolean }) {
  const html = useMemo(() => toHtml(latex, !!display), [latex, display]);
  if (!html) return <code>{latex}</code>;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Текст, где формулы написаны между $…$ или $$…$$ — рисуются как настоящие формулы. */
export function Rich({ text }: { text: string }) {
  const parts = (text ?? "").split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("$$") && p.length > 4 ? <Tex key={i} latex={p.slice(2, -2)} display />
        : p.startsWith("$") && p.length > 2 ? <Tex key={i} latex={p.slice(1, -1)} />
        : <span key={i}>{p}</span>,
      )}
    </>
  );
}

export interface Formula { title: string; latex: string; notebook: string; example?: string }

/** Формула «как в тетради»: красивая запись + пошаговая подсказка, как её записать от руки. */
export function FormulaCard({ f, i = 0 }: { f: Formula; i?: number }) {
  const steps = f.notebook.split(/\r?\n|\\n/).map((s) => s.trim()).filter(Boolean);
  return (
    <div className="paper" style={{ animationDelay: `${i * 0.07}s` }}>
      <div className="paper-h">{f.title}</div>
      <div className="paper-f"><Tex latex={f.latex} display /></div>
      <div className="paper-n">
        <b>Как записать в тетрадь</b>
        <ol>{steps.map((s, k) => <li key={k}><Rich text={s.replace(/^\d+[.)]\s*/, "")} /></li>)}</ol>
        {f.example && <p className="paper-e"><b>Пример: </b><Rich text={f.example} /></p>}
      </div>
    </div>
  );
}
