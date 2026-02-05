"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(
          [
            // layout
            "w-full appearance-none rounded-2xl px-3 py-2 pr-9 text-sm",
            // glass premium
            "border border-white/10 bg-zinc-950/55 backdrop-blur",
            "shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_18px_45px_-30px_rgba(0,0,0,0.8)]",
            // text
            "text-white",
            // hover
            "hover:border-white/20 hover:bg-zinc-950/65",
            // focus premium
            "outline-none",
            "focus-visible:border-white/25",
            "focus-visible:ring-2 focus-visible:ring-fuchsia-400/45",
            "focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
            "focus-visible:shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_0_0_6px_rgba(217,70,239,0.12),0_22px_55px_-30px_rgba(0,0,0,0.85)]",
            // disabled
            "disabled:cursor-not-allowed disabled:opacity-60",
            // motion
            "transition-[background-color,border-color,box-shadow] duration-200 ease-out",
          ].join(" "),
          className
        )}
        {...props}
      >
        {children}
      </select>

      {/* seta custom (não interfere no click) */}
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-zinc-400">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}
