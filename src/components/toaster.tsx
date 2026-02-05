"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      richColors
      position="top-right"
      closeButton
      toastOptions={{
        style: { background: "rgba(24,24,27,0.9)", border: "1px solid rgba(255,255,255,0.08)" },
      }}
    />
  );
}
