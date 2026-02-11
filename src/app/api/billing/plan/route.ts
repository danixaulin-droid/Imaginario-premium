import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { mustEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createSupabaseServer() {
  const cookieStore = cookies();

  return createServerClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components podem bloquear set
          }
        },
      },
    }
  );
}

export async function GET() {
  try {
    const supabase = createSupabaseServer();

    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    // pega assinatura ativa do usuário
    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("id, plan_id, status, current_period_start, current_period_end")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subErr) throw subErr;

    // fallback: se não tem assinatura, considera "free"
    if (!sub?.plan_id) {
      const { data: freePlan } = await supabase
        .from("billing_plans")
        .select("id, slug, name, period, credits, credits_monthly, price_cents, currency, is_active")
        .eq("slug", "free")
        .maybeSingle();

      return NextResponse.json({
        ok: true,
        plan: freePlan ?? {
          slug: "free",
          name: "Free",
          period: "monthly",
          credits: 0,
          credits_monthly: 0,
          price_cents: 0,
          currency: "BRL",
          is_active: true,
        },
        subscription: null,
      });
    }

    // busca plano pelo plan_id
    const { data: plan, error: planErr } = await supabase
      .from("billing_plans")
      .select("id, slug, name, period, credits, credits_monthly, price_cents, currency, is_active")
      .eq("id", sub.plan_id)
      .maybeSingle();

    if (planErr) throw planErr;

    return NextResponse.json({
      ok: true,
      plan: plan ?? null,
      subscription: sub ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Erro ao carregar plano." },
      { status: 500 }
    );
  }
}
