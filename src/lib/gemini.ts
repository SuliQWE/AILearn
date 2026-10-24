import { z } from "zod";
import { env } from "./env";
import { HttpError } from "./http";

/**
 * Единственная точка работы с ИИ. Ключ используется только на сервере.
 * Чтобы заменить провайдера (Claude, OpenAI), достаточно переписать этот файл.
 */
export type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

const MAX_CONCURRENT = 3;
let active = 0;
const waiters: Array<() => void> = [];

async function acquire() {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiters.push(r));
  active++;
}
function release() {
  active--;
  waiters.shift()?.();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GenOpts {
  system?: string;
  json?: boolean;
  temperature?: number;
}

export async function geminiGenerate(parts: Part[], opts: GenOpts = {}): Promise<string> {
  await acquire();
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent`;
    const body = {
      ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: opts.temperature ?? 0.4,
        ...(opts.json ? { responseMimeType: "application/json" } : {}),
      },
    };

    let lastStatus = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": env.geminiKey },
        body: JSON.stringify(body),
      });
      lastStatus = res.status;
      if (res.status === 429 || res.status >= 500) {
        await sleep(1500 * 2 ** attempt); // 1.5s, 3s, 6s, 12s
        continue;
      }
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        console.error("Gemini error", res.status, t.slice(0, 500));
        if (res.status === 400 || res.status === 403 || res.status === 404) {
          throw new HttpError(502, "Gemini отклонил запрос: проверьте GEMINI_API_KEY, GEMINI_MODEL и доступность API в вашем регионе");
        }
        throw new HttpError(502, "Ошибка ИИ-сервиса");
      }
      const data = await res.json();
      const text = (data?.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: string }) => p.text ?? "")
        .join("")
        .trim();
      if (!text) throw new HttpError(502, "ИИ вернул пустой ответ, попробуйте ещё раз");
      return text;
    }
    throw new HttpError(
      lastStatus === 429 ? 429 : 503,
      lastStatus === 429 ? "Превышен лимит запросов к ИИ. Подождите минуту и повторите" : "ИИ-сервис временно недоступен",
    );
  } finally {
    release();
  }
}

export async function geminiJson<T>(parts: Part[], schema: z.ZodType<T, z.ZodTypeDef, unknown>, system?: string): Promise<T> {
  let lastErr = "";
  for (let i = 0; i < 3; i++) {
    const extra: Part[] = i === 0 ? [] : [{ text: `Предыдущий ответ не прошёл проверку (${lastErr}). Верни исправленный JSON строго по схеме.` }];
    const raw = await geminiGenerate([...parts, ...extra], { system, json: true, temperature: 0.4 });
    try {
      const cleaned = raw.replace(/^```json\s*|^```\s*|```$/g, "").trim();
      return schema.parse(JSON.parse(cleaned));
    } catch (e) {
      lastErr = e instanceof z.ZodError ? e.issues.slice(0, 3).map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") : "невалидный JSON";
    }
  }
  throw new HttpError(502, "ИИ не смог составить материалы в нужном формате. Нажмите «Сгенерировать» ещё раз");
}
