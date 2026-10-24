import { z } from "zod";
import { admin } from "@/lib/supabase";
import { requireTeacher } from "@/lib/auth";
import { handle0, ok, readJson, HttpError } from "@/lib/http";

export const GET = handle0(async (req) => {
  const user = await requireTeacher(req);
  const { data, error } = await admin()
    .from("classes")
    .select("id, name, created_at, class_students(count)")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new HttpError(500, "Не удалось загрузить классы");
  return ok({ classes: data });
});

const Body = z.object({ name: z.string().trim().min(1).max(80) });

export const POST = handle0(async (req) => {
  const user = await requireTeacher(req);
  const { name } = Body.parse(await readJson(req));
  const { data, error } = await admin().from("classes").insert({ teacher_id: user.id, name }).select().single();
  if (error) throw new HttpError(500, "Не удалось создать класс");
  return ok({ class: data }, 201);
});
