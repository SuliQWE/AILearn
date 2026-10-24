import JSZip from "jszip";

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/** Достаёт текст со слайдов .pptx. */
export async function pptxToText(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const num = (n: string) => Number(n.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
  const slides = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => num(a) - num(b));
  const out: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    const xml = await zip.file(slides[i])!.async("string");
    const texts = Array.from(xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)).map((m) => decode(m[1]));
    if (texts.length) out.push(`Слайд ${i + 1}: ${texts.join(" ")}`);
  }
  return out.join("\n");
}
