import { admin } from "@/lib/supabase";
import { env } from "@/lib/env";
import { handle0, ok, HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";

const PASSWORD = "Demo-Lesson-2026";
const DEMO = [
  { email: "ailesson.demo1@gmail.com", name: "Асанова Айгуль", label: "Учитель математики" },
  { email: "ailesson.demo2@gmail.com", name: "Иванов Пётр", label: "Учитель физики" },
];
let ensured = false;

/**
 * Демо-доступ для жюри: создаёт (если ещё нет) два подтверждённых аккаунта учителей и возвращает данные для входа.
 * Работает только при DEMO_ENABLED=true. После показа проекта поставьте false.
 */
export const POST = handle0(async () => {
  if (!env.demoEnabled) throw new HttpError(403, "Демо-доступ отключён");
  if (!ensured) {
    for (const d of DEMO) {
      const { error } = await admin().auth.admin.createUser({
        email: d.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: d.name },
      });
      if (error && !/already|registered|exists/i.test(error.message)) {
        console.error("demo account:", error.message);
        throw new HttpError(500, `Не удалось создать демо-аккаунт: ${error.message}`);
      }
    }
    ensured = true;
  }
  return ok({ accounts: DEMO.map((d) => ({ ...d, password: PASSWORD })) });
});
