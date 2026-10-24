import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });

function toResponse(e: unknown): Response {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: "Некорректные данные", details: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  }
  console.error(e);
  return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
}

type Ctx<P> = { params: Promise<P> };

/** Обёртка для маршрутов с динамическими параметрами. */
export function handle<P>(fn: (req: Request, ctx: Ctx<P>) => Promise<Response>) {
  return async (req: Request, ctx: Ctx<P>): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      return toResponse(e);
    }
  };
}

/** Обёртка для маршрутов без параметров. */
export function handle0(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (e) {
      return toResponse(e);
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Тело запроса должно быть JSON");
  }
}
