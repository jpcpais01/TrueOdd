import type { ReactNode } from "react";
import clsx from "@/lib/clsx";

export default function Panel({
  children,
  className,
  glow,
}: {
  children?: ReactNode;
  className?: string;
  glow?: "yes" | "no" | "amber" | "cyan" | "none";
}) {
  const glowClass =
    glow === "yes"
      ? "shadow-glow border-arcade-yes/30"
      : glow === "no"
        ? "shadow-glowNo border-arcade-no/30"
        : glow === "amber"
          ? "border-arcade-amber/30"
          : glow === "cyan"
            ? "border-arcade-cyan/30"
            : "border-white/5";

  return (
    <div
      className={clsx(
        "rounded-2xl border bg-arcade-panel2/80 shadow-panel backdrop-blur-sm",
        glowClass,
        className,
      )}
    >
      {children}
    </div>
  );
}
