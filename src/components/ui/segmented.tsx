"use client";

import { cn } from "@/lib/utils";
import { Sparkles, Wand2, ImagePlus } from "lucide-react";

type Tab = "generate" | "edit" | "history";

export function Segmented({
  value,
  onChange,
}: {
  value: Tab;
  onChange: (v: Tab) => void;
}) {
  const items: Array<{
    key: Tab;
    label: string;
    icon: any;
  }> = [
    { key: "generate", label: "Gerar", icon: Sparkles },
    { key: "edit", label: "Editar", icon: Wand2 },
    { key: "history", label: "Histórico", icon: ImagePlus },
  ];

  return (
    <div className="relative grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-white/5 p-1 backdrop-blur">
      {/* glow animado do item ativo */}
      <div
        className={cn(
          "pointer-events-none absolute inset-1 w-1/3 rounded-xl transition-all duration-300 ease-out",
          value === "generate" && "translate-x-0",
          value === "edit" && "translate-x-full",
          value === "history" && "translate-x-[200%]",
          "bg-white shadow-[0_0_25px_rgba(217,70,239,0.45)]"
        )}
      />

      {items.map((item) => {
        const Icon = item.icon;
        const active = item.key === value;

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn(
              "relative z-10 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200",
              active
                ? "text-zinc-900"
                : "text-zinc-300 hover:text-white"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
