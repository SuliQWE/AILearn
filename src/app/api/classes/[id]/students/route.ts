import { z } from "zod";
import { admin } from "@/lib/supabase";
import { requireTeacher } from "@/lib/auth";
import { handle, ok, readJson, HttpError } from "@/lib/http";

async function ownedClass(req: Request, id: string) {
  const user = await requireTeacher(req);
  const { data } = await admin().from("classes").select("id").eq("id", id).eq("teacher_id", user.id).maybeSingle();
  if (!data) throw new HttpError(404, "Класс не найден");
}

export const GET = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  await ownedClass(req, id);
  const { data, error } = await admin().from("class_students").select("id, full_name").eq("class_id", id).order("full_name");
  if (error) throw new HttpError(500, "Не удалось загрузить учеников");
  return ok({ students: data });
});

// names: массив ФИО или строка с переносами (удобно вставить список из Excel)
const Body = z.object({ names: z.union([z.string(), z.array(z.string())]) });

export const POST = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  await ownedClass(req, id);
  const { names } = Body.parse(await readJson(req));
  const list = (Array.isArray(names) ? names : names.split(/\r?\n/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 80);
  const unique = Array.from(new Set(list)).slice(0, 60);
  if (!unique.length) throw new HttpError(400, "Список пуст");
  const { error } = await admin()
    .from("class_students")
    .upsert(unique.map((full_name) => ({ class_id: id, full_name })), { onConflict: "class_id,full_name", ignoreDuplicates: true });
  if (error) throw new HttpError(500, "Не удалось добавить учеников");
  return ok({ added: unique.length }, 201);
});
