import { admin } from "./supabase";

const cache = new Map<string, { name: string | null; at: number }>();

/** ФИО учителя из user_metadata.full_name (с кэшем на 5 минут). */
export async function teacherName(id: string): Promise<string | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 300_000) return hit.name;
  let name: string | null = null;
  try {
    const { data } = await admin().auth.admin.getUserById(id);
    const m = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    name = typeof m.full_name === "string" && m.full_name.trim() ? m.full_name.trim() : null;
  } catch { /* не критично */ }
  cache.set(id, { name, at: Date.now() });
  return name;
}
