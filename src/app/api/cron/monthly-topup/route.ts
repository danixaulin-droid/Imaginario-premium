import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function assertCronAuth(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("CRON_SECRET não configurado");
  }

  const header = req.headers.get("x-cron-secret");
  if (header !== secret) {
    throw new Error("Não autorizado");
  }
}

export async function GET(req: Request) {
  try {
    assertCronAuth(req);

    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase.rpc("monthly_plan_topup");

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, result: data },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro" },
      { status: 401 }
    );
  }
}
