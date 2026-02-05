import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  // Botão principal (Premium): glow + leve gradiente + interação
  default: cn(
    "text-zinc-950 border border-white/10",
    "bg-gradient-to-b from-white to-zinc-200 hover:from-zinc-100 hover:to-zinc-200",
    "shadow-[0_10px_30px_-12px_rgba(255,255,255,0.35)]",
    "hover:shadow-[0_18px_45px_-18px_rgba(217,70,239,0.45)]",
    "active:scale-[0.99]"
  ),

  // Secondary: mais “glass” com glow discreto
  secondary: cn(
    "text-white border border-white/10",
    "bg-white/10 hover:bg-white/15",
    "shadow-[0_10px_30px_-18px_rgba(217,70,239,0.25)]",
    "hover:shadow-[0_18px_45px_-22px_rgba(59,130,246,0.35)]",
    "active:scale-[0.99]"
  ),

  // Ghost: sem fundo, só hover elegante
  ghost: cn(
    "text-white border border-transparent",
    "bg-transparent hover:bg-white/10",
    "shadow-none",
    "active:scale-[0.99]"
  ),

  // Danger: vermelho forte (mantém simples e estável)
  danger: cn(
    "text-white border border-red-400/30",
    "bg-red-500 hover:bg-red-600",
    "shadow-[0_10px_30px_-18px_rgba(239,68,68,0.35)]",
    "hover:shadow-[0_18px_45px_-22px_rgba(239,68,68,0.45)]",
    "active:scale-[0.99]"
  ),
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  asChild?: boolean;
  href?: string;
}

export function Button({
  className,
  variant = "default",
  asChild,
  href,
  type,
  ...props
}: ButtonProps) {
  const base = cn(
    // layout
    "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium",
    // feel premium
    "transition-all duration-200 ease-out",
    "will-change-transform",
    // foco acessível
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
    // disabled
    "disabled:opacity-50 disabled:cursor-not-allowed",
    // glow overlay (sem depender de CSS extra)
    "relative isolate overflow-hidden"
  );

  // glow suave ao hover (não interfere no layout)
  const glow = cn(
    "before:absolute before:inset-0 before:-z-10 before:opacity-0 before:transition-opacity before:duration-200",
    "before:[background:radial-gradient(circle_at_30%_20%,rgba(217,70,239,0.35),transparent_55%),radial-gradient(circle_at_70%_60%,rgba(59,130,246,0.25),transparent_60%)]",
    "hover:before:opacity-100"
  );

  const cls = cn(base, glow, styles[variant], className);

  // Mantém seu comportamento atual: só usa <Link> quando asChild + href
  if (asChild && href) {
    return (
      <Link className={cls} href={href}>
        {props.children}
      </Link>
    );
  }

  // ✅ evita submit acidental dentro de <form>
  return <button className={cls} type={type ?? "button"} {...props} />;
}
