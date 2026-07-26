import type { Metadata } from "next";
import { Geist, Geist_Mono, Rajdhani } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// HUD display face for scores/big headers only (no Korean glyphs, so
// Korean text naturally falls back to Geist Sans - this never touches
// body copy, just the console-sports-game numerals/labels).
const rajdhani = Rajdhani({
  variable: "--font-hud",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "감독석 | 2026 월드컵 전술 보드",
  description: "실제 2026 월드컵 데이터로 감독이 되어 전술을 짜보세요.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${rajdhani.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
