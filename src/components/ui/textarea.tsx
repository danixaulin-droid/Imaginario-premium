import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          [
            // layout
            "min-h-[120px] w-full resize-y rounded-2xl px-3 py-2 text-sm",
            // glass premium
            "border border-white/10 bg-zinc-950/55 backdrop-blur",
            "shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_18px_45px_-30px_rgba(0,0,0,0.8)]",
            // text
            "text-white placeholder:text-zinc-500",
            // hover
            "hover:border-white/20 hover:bg-zinc-950/65",
            // focus premium (glow)
            "outline-none",
            "focus-visible:border-white/25",
            "focus-visible:ring-2 focus-visible:ring-fuchsia-400/45",
            "focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
            "focus-visible:shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_0_0_6px_rgba(217,70,239,0.12),0_22px_55px_-30px_rgba(0,0,0,0.85)]",
            // disabled
            "disabled:cursor-not-allowed disabled:opacity-60",
            // smooth
            "transition-[background-color,border-color,box-shadow] duration-200 ease-out",
          ].join(" "),
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";
