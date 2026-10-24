import "katex/dist/katex.min.css";
import "./globals.css";
import type { Viewport } from "next";

export const metadata = { title: "AI Lesson — ИИ-помощник для уроков", description: "Урок, в котором ИИ помогает каждому ученику" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#070a0f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <div className="bg" aria-hidden><span className="blob a" /><span className="blob b" /><span className="blob c" /></div>
        {children}
      </body>
    </html>
  );
}
