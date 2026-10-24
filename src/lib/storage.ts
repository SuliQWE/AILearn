import { admin } from "./supabase";

export const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

/** Подписанные ссылки (1 час) на картинки формул/слайдов из закрытого бакета materials. */
export async function signMaterialImages(paths: string[] | null | undefined): Promise<{ path: string; url: string }[]> {
  const list = (paths ?? []).filter(Boolean);
  if (!list.length) return [];
  const { data } = await admin().storage.from("materials").createSignedUrls(list, 3600);
  return (data ?? []).filter((u) => u.path && u.signedUrl).map((u) => ({ path: u.path as string, url: u.signedUrl as string }));
}
