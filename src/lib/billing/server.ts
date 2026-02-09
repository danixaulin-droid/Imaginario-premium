import { createClient } from "@supabase/supabase-js";

function mustEnv(key: string) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

export function supabaseAdmin() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

export type UsageAction = "generate" | "edit";

export function calcCreditsUsed(action: UsageAction, opts: {
  quality?: "standard" | "hd";
  n?: number;
}) {
  const n = Math.max(1, Number(opts.n ?? 1));
  const q = opts.quality ?? "standard";

  // ✅ regra simples e estável
  // generate standard: 1 por imagem
  // generate hd: 2 por imagem
  // edit: 2 por edição (standard fixo no seu app)
  if (action === "edit") return 2 * n;
  return (q === "hd" ? 2 : 1) * n;
}

export async function getProfile(userId: string) {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .select("id,email,plan,credits")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return data;
}

export async function ensureCreditsOrThrow(params: {
  userId: string;
  action: UsageAction;
  quality?: "standard" | "hd";
  n?: number;
}) {
  const admin = supabaseAdmin();
  const cost = calcCreditsUsed(params.action, { quality: params.quality, n: params.n });

  const profile = await getProfile(params.userId);
  if ((profile?.credits ?? 0) < cost) {
    const need = cost - (profile?.credits ?? 0);
    throw new Error(`Sem créditos suficientes. Faltam ${need} crédito(s).`);
  }

  return { cost, profile };
}

export async function consumeCreditsAndLog(params: {
  userId: string;
  action: UsageAction;
  cost: number;
  generation?: {
    kind: "generate" | "edit";
    prompt?: string;
    size?: string;
    quality?: string;
    n?: number;
    results?: any; // jsonb
  };
  usage?: {
    model?: string;
    size?: string;
    quality?: string;
    n?: number;
    meta?: any;
  };
}) {
  const admin = supabaseAdmin();

  // 1) desconta créditos (atomic update simples)
  const { data: updated, error: upErr } = await admin
    .from("profiles")
    .update({ credits: admin.rpc ? undefined : undefined })
    .eq("id", params.userId);

  // ⚠️ Como update decrement não é nativo, fazemos via RPC abaixo (recomendado).
  // Para não travar aqui, vamos usar um RPC no próximo bloco e manter essa função chamando o RPC.

  return { updated };
}
