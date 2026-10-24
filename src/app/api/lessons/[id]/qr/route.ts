import QRCode from "qrcode";
import { requireOwnedLesson } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
import { env } from "@/lib/env";

export const GET = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const { lesson } = await requireOwnedLesson(req, id);
  const url = `${env.appUrl}/join/${lesson.join_code}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 512, errorCorrectionLevel: "M" });
  return ok({ url, code: lesson.join_code, qr });
});
