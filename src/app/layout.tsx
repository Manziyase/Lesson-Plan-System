import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Inzozi Academy — Lesson Planning & Knowledge Management",
  description:
    "Lesson planning and knowledge management for Rwandan schools. Plan with the four-column table: Time · Learning Area · Learning Competence · Lesson Procedure.",
  icons: { icon: "/brand/logo-mark.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#16246E",
};

/* Runs before first paint: restores the saved theme (or the OS preference)
   on <html>, so the page never flashes the wrong colours. */
const themeScript = `(function(){try{var t=localStorage.getItem("slp_theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
