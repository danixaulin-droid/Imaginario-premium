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

export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth.user) return noStoreJson({ error: "Não autenticado." }, 401);

    const admin = createSupabaseAdmin();

    // garante a linha (caso o user ainda não tenha)
    await admin.rpc("ensure_user_credits_row", { p_user_id: auth.user.id } as any);

    const { data, error } = await admin
      .from("user_credits")
      .select("balance")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error) return noStoreJson({ error: error.message }, 400);

    return noStoreJson({ ok: true, balance: Number(data?.balance ?? 0) });
  } catch (err: any) {
    return noStoreJson({ error: err?.message ?? "Erro" }, 400);
  }
}
