import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Press_Start_2P, Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/ui/BottomNav";
import TopTicker from "@/components/ui/TopTicker";

const display = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TrueOdd — Kalshi BTC 15m Paper Trader",
  description:
    "Paper-trading research dashboard testing whether Kalshi's rolling BTC 15-minute Up/Down markets misprice against a Monte Carlo fair-probability model.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0b14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable} ${body.variable}`}>
      <body className="font-body antialiased">
        <div className="scanlines" />
        <div className="mx-auto flex min-h-dvh max-w-md flex-col">
          <TopTicker />
          <main className="flex-1 px-3 pb-24 pt-3">{children}</main>
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
