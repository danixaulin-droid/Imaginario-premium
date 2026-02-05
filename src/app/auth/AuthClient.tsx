"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function Tabs({
  value,
  onChange,
}: {
  value: "login" | "signup";
  onChange: (v: "login" | "signup") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-1">
      <button
        className={`rounded-2xl px-3 py-2 text-sm transition ${
          value === "login"
            ? "bg-white text-zinc-900"
            : "text-zinc-200 hover:bg-white/10"
        }`}
        onClick={() => onChange("login")}
        type="button"
      >
        Entrar
      </button>
      <button
        className={`rounded-2xl px-3 py-2 text-sm transition ${
          value === "signup"
            ? "bg-white text-zinc-900"
            : "text-zinc-200 hover:bg-white/10"
        }`}
        onClick={() => onChange("signup")}
        type="button"
      >
        Criar conta
      </button>
    </div>
  );
}

export default function AuthClient() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        toast.success("Bem-vinda! Login realizado.");
        router.push(next);
        router.refresh();
        return;
      }

      // signup
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (typeof window !== "undefined" ? window.location.origin : "");

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(
            next
          )}`,
        },
      });

      if (error) throw error;

      toast.success(
        "Conta criada! Verifique seu e-mail para confirmar (se estiver habilitado)."
      );

      // Melhor prática: após signup, manda pra /auth e deixa a pessoa confirmar
      router.push("/auth?next=" + encodeURIComponent(next));
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao autenticar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-lg gap-4">
      <h1 className="text-2xl font-semibold">Entrar / Criar conta</h1>

      <Card className="p-6">
        <Tabs value={mode} onChange={setMode} />

        <form className="mt-4 grid gap-3" onSubmit={onSubmit}>
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-300">E-mail</span>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seuemail@exemplo.com"
              autoComplete="email"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-zinc-300">Senha</span>
            <Input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>

          <Button disabled={loading} type="submit" className="mt-2">
            {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
          </Button>

          <p className="text-xs text-zinc-400">
            Dica: para produção, ative confirmação de e-mail no Supabase.
          </p>
        </form>
      </Card>
    </div>
  );
}
