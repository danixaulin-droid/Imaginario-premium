import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Sparkles } from "lucide-react";
import SiteHeaderMenu from "@/components/site-header-menu";

export default async function SiteHeader() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Imaginário";

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/70 backdrop-blur">
      {/* linha glow sutil */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400/40 to-transparent" />
      {/* glow no header */}
      <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(circle_at_20%_0%,rgba(217,70,239,0.18),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.14),transparent_50%)]" />

      <div className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="group flex items-center gap-2 font-semibold">
          <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-[0_18px_45px_-28px_rgba(217,70,239,0.55)]">
            <span className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-200 group-hover:opacity-100 [background:radial-gradient(circle_at_30%_20%,rgba(217,70,239,0.35),transparent_60%),radial-gradient(circle_at_70%_60%,rgba(59,130,246,0.22),transparent_65%)]" />
            <Sparkles className="relative h-5 w-5 text-fuchsia-300" />
          </span>

          <span className="relative">
            <span className="title-gradient title-shine text-glow">{appName}</span>
          </span>
        </Link>

        {/* Menu ☰ (fecha ao clicar fora) */}
        <SiteHeaderMenu isLoggedIn={!!user} email={user?.email ?? null} />
      </div>
    </header>
  );
}
