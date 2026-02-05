import * as React from "react";
import { cn } from "@/lib/utils";

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "glow" | "soft";
}

export function Card({
  className,
  variant = "default",
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        /* base */
        "relative rounded-3xl border backdrop-blur transition-all duration-200",

        /* superfície padrão */
        variant === "default" &&
          "border-white/10 bg-white/5 shadow-soft hover:border-white/15",

        /* superfície mais suave (listas, histórico) */
        variant === "soft" &&
          "border-white/8 bg-white/[0.035] shadow-soft",

        /* destaque premium (hero, cards principais) */
        variant === "glow" &&
          "border-white/15 bg-white/5 shadow-glow hover:shadow-glow hover:-translate-y-[1px]",

        /* micro-interação */
        "hover:translate-y-[-1px]",

        className
      )}
      {...props}
    />
  );
}
