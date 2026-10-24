// Создание/обновление учителя администратором:
//   npm run create-teacher -- teacher@school.kg Пароль123 "Иванов Иван Иванович"
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = {};
for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const url = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/(rest|auth|storage)\/v\d+\/?$/i, "").replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const [email, password, ...rest] = process.argv.slice(2);
const full_name = rest.join(" ").trim();

if (!url || !key) { console.error("Нет NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY в .env.local"); process.exit(1); }
if (!email || !password || !full_name) {
  console.error('Использование: npm run create-teacher -- email пароль "Фамилия Имя Отчество"');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
if (!error) { console.log(`✓ Создан: ${full_name} <${data.user.email}>`); process.exit(0); }

if (/already|registered|exists/i.test(error.message)) {
  const { data: list, error: e2 } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = list?.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
  if (e2 || !u) { console.error("Не удалось найти пользователя:", e2?.message); process.exit(1); }
  const { error: e3 } = await db.auth.admin.updateUserById(u.id, { password, email_confirm: true, user_metadata: { ...u.user_metadata, full_name } });
  if (e3) { console.error("Ошибка обновления:", e3.message); process.exit(1); }
  console.log(`✓ Обновлён (пароль и имя): ${full_name} <${email}>`);
} else { console.error("Ошибка:", error.message); process.exit(1); }
