import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

type UserCreditsRow = {
  balance: number | null;
};

export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return noStoreJson({ error: "Não autenticado." }, 401);

    const admin = createSupabaseAdmin();

    // ✅ Tipagem explícita do retorno para evitar "never"
    const { data, error } = await admin
      .from("user_credits")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle<UserCreditsRow>();

    if (error) return noStoreJson({ error: error.message }, 400);

    const balance = Number(data?.balance ?? 0);

    return noStoreJson({ ok: true, balance });
  } catch (err: any) {
    return noStoreJson({ error: err?.message ?? "Erro" }, 400);
  }
}
