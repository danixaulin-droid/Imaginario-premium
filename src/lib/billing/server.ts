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

export function calcCreditsUsed(
  action: UsageAction,
  opts: { quality?: "standard" | "hd"; n?: number }
) {
  const n = Math.max(1, Number(opts.n ?? 1));
  const q = (opts.quality ?? "standard") as "standard" | "hd";

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
  const cost = calcCreditsUsed(params.action, {
    quality: params.quality,
    n: params.n,
  });

  const profile = await getProfile(params.userId);
  const credits = Number(profile?.credits ?? 0);

  if (credits < cost) {
    const need = cost - credits;
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

  // 1) decremento atômico
  const { data: decData, error: decErr } = await admin.rpc("decrement_credits", {
    p_user_id: params.userId,
    p_cost: params.cost,
  });

  if (decErr) {
    // Mensagem amigável
    throw new Error("Sem créditos suficientes ou falha ao debitar créditos.");
  }

  // 2) salvar generation (histórico do dashboard)
  if (params.generation) {
    await admin.from("generations").insert({
      user_id: params.userId,
      kind: params.generation.kind,
      prompt: params.generation.prompt ?? null,
      size: params.generation.size ?? null,
      quality: params.generation.quality ?? null,
      n: params.generation.n ?? 1,
      results: params.generation.results ?? [],
    });
  }

  // 3) salvar usage log (auditoria)
  await admin.from("usage_logs").insert({
    user_id: params.userId,
    action: params.action,
    model: params.usage?.model ?? null,
    size: params.usage?.size ?? null,
    quality: params.usage?.quality ?? null,
    n: params.usage?.n ?? 1,
    credits_used: params.cost,
    meta: params.usage?.meta ?? {},
  });

  const creditsLeft = Array.isArray(decData) ? decData?.[0]?.credits_left : null;
  return { creditsLeft };
}
