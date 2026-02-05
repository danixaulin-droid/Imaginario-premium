"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Menu,
  X,
  LayoutDashboard,
  CreditCard,
  User,
  LogOut,
  LogIn,
} from "lucide-react";

export default function SiteHeaderMenu({
  isLoggedIn,
  email,
}: {
  isLoggedIn: boolean;
  email?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  function close() {
    setOpen(false);
  }

  // Fecha no ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // (Opcional) trava scroll quando aberto (melhora mobile)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Clique fora (segurança extra — além do overlay)
  useEffect(() => {
    function onDown(e: MouseEvent | TouchEvent) {
      if (!open) return;
      const el = wrapRef.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (target && !el.contains(target)) close();
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown as any);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-2xl"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Overlay clicável (fecha ao clicar fora) */}
      <div
        aria-hidden="true"
        onClick={close}
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Dropdown */}
      <div
        className={`absolute right-0 z-50 mt-2 w-64 origin-top-right transition-all duration-200 ease-out ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-2 scale-[0.98] opacity-0"
        }`}
        role="menu"
      >
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/85 shadow-xl backdrop-blur">
          {isLoggedIn ? (
            <>
              <div className="border-b border-white/10 px-4 py-3">
                <div className="text-xs text-zinc-400">Logado como</div>
                <div className="truncate text-sm text-zinc-200">
                  {email || "usuário"}
                </div>
              </div>

              <div className="p-2">
                <Button
                  asChild
                  href="/dashboard"
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={close}
                >
                  <span>
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Dashboard
                  </span>
                </Button>

                <Button
                  asChild
                  href="/pricing"
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={close}
                >
                  <span>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Planos
                  </span>
                </Button>

                <Button
                  asChild
                  href="/account"
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={close}
                >
                  <span>
                    <User className="mr-2 h-4 w-4" />
                    Minha conta
                  </span>
                </Button>

                <div className="my-2 h-px bg-white/10" />

                <form action="/auth/signout" method="post">
                  <Button
                    type="submit"
                    variant="secondary"
                    className="w-full justify-start"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sair
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="p-2">
              <Button
                asChild
                href="/pricing"
                variant="ghost"
                className="w-full justify-start"
                onClick={close}
              >
                <span>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Planos
                </span>
              </Button>

              <Button
                asChild
                href="/auth"
                variant="secondary"
                className="mt-2 w-full justify-start"
                onClick={close}
              >
                <span>
                  <LogIn className="mr-2 h-4 w-4" />
                  Entrar
                </span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
