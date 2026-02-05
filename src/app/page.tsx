import Link from "next/link";
import {
  Sparkles,
  Wand2,
  ShieldCheck,
  Zap,
  User,
  Image as ImageIcon,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createSupabaseServer } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  const isLoggedIn = !!data?.user;

  return (
    <div className="grid gap-12">
      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-10 shadow-glow">
        {/* grid + halo (cara de app IA) */}
        <div className="pointer-events-none absolute inset-0">
          <div className="bg-grid absolute inset-0" />
          <div className="hero-halo absolute inset-0" />
        </div>

        <div className="relative grid gap-6">
          {/* badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-glow inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm text-zinc-100">
              <Sparkles className="h-4 w-4 text-fuchsia-300" />
              Imaginário Premium
            </span>

            <span className="badge-glow inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-zinc-200">
              <ImageIcon className="h-4 w-4" />
              Geração + Edição
            </span>

            <span className="badge-glow inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-zinc-200">
              <Zap className="h-4 w-4" />
              Otimizado p/ celular
            </span>

            <span className="badge-glow inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-zinc-200">
              <ShieldCheck className="h-4 w-4" />
              Seguro e confiável
            </span>
          </div>

          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
            Crie e edite imagens com{" "}
            <span className="bg-gradient-to-r from-fuchsia-400 to-blue-400 bg-clip-text text-transparent">
              inteligência artificial
            </span>
            .
          </h1>

          <p className="max-w-2xl text-lg text-zinc-300">
            Gere imagens profissionais, edite fotos existentes e baixe seus
            resultados em segundos. Tudo em um app rápido, moderno e confiável.
          </p>

          {/* CTA */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Button asChild className="shimmer pulse-glow">
              <Link href="/dashboard">Começar agora</Link>
            </Button>

            {isLoggedIn ? (
              <Button asChild variant="secondary">
                <Link href="/account">
                  <User className="mr-2 h-4 w-4" />
                  Minha conta
                </Link>
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <Link href="/auth">Entrar / Criar conta</Link>
              </Button>
            )}

            <Button asChild variant="ghost">
              <Link href="/pricing">Ver planos</Link>
            </Button>
          </div>

          {/* highlights */}
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="card-surface p-5">
              <div className="flex items-center gap-2 font-medium">
                <Wand2 className="h-4 w-4 text-fuchsia-300" />
                Edição inteligente
              </div>
              <p className="mt-1 text-sm text-zinc-300">
                Troque fundos, cores e detalhes usando apenas texto.
              </p>
            </div>

            <div className="card-surface p-5">
              <div className="flex items-center gap-2 font-medium">
                <Zap className="h-4 w-4 text-blue-300" />
                Qualidade premium
              </div>
              <p className="mt-1 text-sm text-zinc-300">
                Resultados nítidos, prontos para postar ou vender.
              </p>
            </div>

            <div className="card-surface p-5">
              <div className="flex items-center gap-2 font-medium">
                <Clock className="h-4 w-4 text-emerald-300" />
                Histórico completo
              </div>
              <p className="mt-1 text-sm text-zinc-300">
                Todas as suas criações salvas em um só lugar.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section className="grid gap-6 md:grid-cols-3">
        <Card className="group relative overflow-hidden p-6">
          <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
            <div className="absolute -inset-24 bg-fuchsia-500/10 blur-3xl" />
          </div>
          <div className="relative">
            <Sparkles className="h-6 w-6 text-fuchsia-300" />
            <h3 className="mt-3 font-semibold">Geração instantânea</h3>
            <p className="mt-2 text-sm text-zinc-300">
              Escreva o que imagina e gere imagens em poucos segundos.
            </p>
          </div>
        </Card>

        <Card className="group relative overflow-hidden p-6">
          <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
            <div className="absolute -inset-24 bg-blue-500/10 blur-3xl" />
          </div>
          <div className="relative">
            <Wand2 className="h-6 w-6 text-blue-300" />
            <h3 className="mt-3 font-semibold">Edição por imagem</h3>
            <p className="mt-2 text-sm text-zinc-300">
              Envie uma foto, descreva a mudança e deixe a IA fazer o resto.
            </p>
          </div>
        </Card>

        <Card className="group relative overflow-hidden p-6">
          <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
            <div className="absolute -inset-24 bg-emerald-500/10 blur-3xl" />
          </div>
          <div className="relative">
            <ShieldCheck className="h-6 w-6 text-emerald-300" />
            <h3 className="mt-3 font-semibold">Seguro e confiável</h3>
            <p className="mt-2 text-sm text-zinc-300">
              Autenticação, histórico e infraestrutura pronta para produção.
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}
