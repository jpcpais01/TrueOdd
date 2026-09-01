"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "@/lib/clsx";

const TABS = [
  { href: "/", label: "PLAY", icon: "▣" },
  { href: "/analytics", label: "STATS", icon: "▤" },
  { href: "/settings", label: "CONFIG", icon: "⚙" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-white/5 bg-arcade-bg/90 backdrop-blur-md">
      <div className="grid grid-cols-3">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                "flex flex-col items-center gap-1 py-3 text-[10px] tracking-widest transition-colors",
                active ? "text-arcade-yes" : "text-arcade-dim hover:text-arcade-text",
              )}
            >
              <span className={clsx("text-lg", active && "animate-pulseGlow rounded-md")}>
                {tab.icon}
              </span>
              <span className="font-display text-[8px]">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
