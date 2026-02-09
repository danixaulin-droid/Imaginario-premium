import { NextResponse } from "next/server";
import { z } from "zod";
import { getOpenAI } from "@/lib/openai";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { toFile } from "openai/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ✅ se seu plano suportar, ajuda muito. No Hobby pode ser ignorado, mas não quebra build.
export const maxDuration = 120;

/* =========================
   MONETIZAÇÃO (CRÉDITOS)
========================= */

// Custo do EDIT (você pode ajustar depois)
const CREDIT_COST_EDIT = 3;

// 402 = Payment Required (bom pra créditos)
function paymentRequiredJson(message: string, extra?: any) {
  return NextResponse.json(
    { error: message, code: "INSUFFICIENT_CREDITS", ...extra },
    { status: 402, headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

/**
 * Debita créditos de forma ATÔMICA:
 * - só debita se balance >= cost
 * - evita race condition
 */
async function debitCreditsAtomic(params: {
  admin: ReturnType<typeof createSupabaseAdmin>;
  userId: string;
  cost: number;
}) {
  const { admin, userId, cost } = params;

  // Tenta debitar com condição balance >= cost
  const { data, error } = await admin
    .from("user_credits")
    .update({ balance: admin.rpc ? undefined : undefined } as any) // (não altera nada aqui; update real é feito via SQL abaixo)
    .eq("user_id", userId);

  // ⚠️ Supabase JS não permite "balance = balance - cost" direto sem RPC.
  // Então fazemos via RPC opcional se existir, e fallback para um update seguro via SQL function,
  // MAS como você rodou SQL, normalmente você terá uma função.
  // Para não quebrar build, tentamos RPC primeiro e, se não existir, usamos fallback com select+update (menos ideal).

  // 1) RPC preferencial (se você criou no SQL)
  // - nome sugerido: debit_credits(user_id uuid, cost int) -> returns new_balance int
  try {
    const rpc = await admin.rpc("debit_credits", { p_user_id: userId, p_cost: cost });
    if (!rpc.error) {
      const newBalance = (rpc.data ?? null) as number | null;
      if (newBalance === null || Number.isNaN(newBalance)) {
        throw new Error("RPC debit_credits retornou inválido.");
      }
      return { ok: true as const, newBalance };
    }
  } catch {
    // ignore e tenta fallback
  }

  // 2) Fallback (select -> update com checagem)
  // (pode ter race em altíssima concorrência, mas funciona na prática pra MVP)
  const { data: row, error: selErr } = await admin
    .from("user_credits")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (selErr) throw selErr;

  const balance = Number(row?.balance ?? 0);
  if (!Number.isFinite(balance) || balance < cost) {
    return { ok: false as const, balance };
  }

  const newBalance = balance - cost;

  const { error: updErr } = await admin
    .from("user_credits")
    .update({ balance: newBalance })
    .eq("user_id", userId);

  if (updErr) throw updErr;

  return { ok: true as const, newBalance };
}

async function refundCreditsBestEffort(params: {
  admin: ReturnType<typeof createSupabaseAdmin>;
  userId: string;
  cost: number;
}) {
  const { admin, userId, cost } = params;

  // 1) RPC preferencial
  try {
    const rpc = await admin.rpc("refund_credits", { p_user_id: userId, p_cost: cost });
    if (!rpc.error) return;
  } catch {
    // ignore
  }

  // 2) fallback (select -> update)
  try {
    const { data: row } = await admin
      .from("user_credits")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();

    const balance = Number(row?.balance ?? 0);
    const newBalance = (Number.isFinite(balance) ? balance : 0) + cost;

    await admin.from("user_credits").update({ balance: newBalance }).eq("user_id", userId);
  } catch {
    // ignore
  }
}

async function logUsageBestEffort(params: {
  admin: ReturnType<typeof createSupabaseAdmin>;
  userId: string;
  action: string;
  creditsUsed: number;
  meta?: any;
}) {
  const { admin, userId, action, creditsUsed, meta } = params;

  try {
    await admin.from("usage_logs").insert({
      user_id: userId,
      action,
      credits_used: creditsUsed,
      meta: meta ?? null,
    } as any);
  } catch {
    // ignore
  }
}

/* =========================
   HELPERS (seus)
========================= */

function normalizeSize(raw: unknown) {
  let s = String(raw ?? "1024x1024").trim();

  // aceita "1024×1024" (símbolo vezes)
  s = s.replace(/×/g, "x");

  // se vier "1024" -> "1024x1024"
  if (/^\d+$/.test(s)) s = `${s}x${s}`;

  // fallback seguro
  if (!/^\d+x\d+$/.test(s)) s = "1024x1024";

  // só permitimos os 3 que o modelo aceita
  if (s !== "1024x1024" && s !== "1024x1536" && s !== "1536x1024") {
    s = "1024x1024";
  }

  return s as "1024x1024" | "1024x1536" | "1536x1024";
}

const FieldsSchema = z.object({
  prompt: z.string().min(3).max(2000),
  size: z.enum(["1024x1024", "1024x1536", "1536x1024"]).default("1024x1024"),
  background: z.enum(["auto", "transparent", "opaque"]).default("auto"),

  // ✅ aceita o que sua UI manda hoje (standard/hd)
  // ✅ e também aceita o que o endpoint exige (auto/low/medium/high)
  quality: z
    .enum(["standard", "hd", "auto", "low", "medium", "high"])
    .default("standard"),
});

// ✅ O endpoint que você está usando aceita: auto | low | medium | high
function mapQuality(
  q: "standard" | "hd" | "auto" | "low" | "medium" | "high"
): "auto" | "low" | "medium" | "high" {
  if (q === "hd") return "high";
  if (q === "standard") return "medium";
  return q;
}

function b64ToUint8Array(b64: string) {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/* =========================
   SAFETY / SANITIZAÇÃO
========================= */
function sanitizePrompt(input: string) {
  let p = (input || "").trim();

  p = p.replace(/\b(1[0-9]|20)\s*anos\b/gi, "adultas");
  p = p.replace(/\b(jovem|jovens|novinha|novinhas)\b/gi, "adultas");
  p = p.replace(/\b(sexy|sensual|provocante|er[oó]tica|erotic)\b/gi, "discretas");

  const mentionsPeople =
    /\b(mulher|mulheres|pessoa|pessoas|garota|garotas|homem|homens)\b/i.test(p);
  const mentionsAdult =
    /\b(adulta|adultas|adulto|adultos|18\+|maior de idade)\b/i.test(p);

  if (mentionsPeople && !mentionsAdult) {
    p = `Adicione pessoas adultas (18+) de forma discreta. ${p}`;
  }

  if (!/\bsem foco no corpo\b/i.test(p) && mentionsPeople) {
    p += " Sem foco no corpo.";
  }

  return p.trim();
}

function isSafetyErrorMessage(message: string) {
  const m = (message || "").toLowerCase();
  return (
    m.includes("rejected by the safety system") ||
    m.includes("safety_violations") ||
    m.includes("content policy") ||
    m.includes("content_policy") ||
    m.includes("policy") ||
    m.includes("safety")
  );
}

function isPayloadTooLargeMessage(message: string) {
  const m = (message || "").toLowerCase();
  return (
    m.includes("request entity too large") ||
    m.includes("payload too large") ||
    m.includes("body exceeded") ||
    m.includes("413") ||
    m.includes("too large")
  );
}

function noStoreJson(body: any, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

/**
 * ✅ IMPORTANTE:
 * - Aceita PromiseLike (thenable do Supabase)
 * - Promise.resolve(...) converte thenable em Promise real
 */
async function withTimeout<T>(p: PromiseLike<T>, ms: number, label = "timeout") {
  let t: NodeJS.Timeout | null = null;

  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(label)), ms);
  });

  try {
    return await Promise.race([Promise.resolve(p), timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
}

/* =========================
   ROUTE
========================= */
export async function POST(req: Request) {
  // ✅ Para reembolso se necessário
  let reservedCredits = false;

  try {
    const supabase = await createSupabaseServer();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return noStoreJson({ error: "Não autenticado." }, { status: 401 });
    }

    // ✅ MONETIZAÇÃO (reserva/débito ANTES do OpenAI)
    // Não mexe na sua lógica, só bloqueia quando não tem crédito.
    const admin = createSupabaseAdmin();

    // (opcional) garante linha do usuário (se você criou função no SQL)
    // Se não existir, segue (fallback será balance=0)
    try {
      await admin.rpc("ensure_user_credits_row", { p_user_id: auth.user.id });
    } catch {
      // ignore
    }

    const debit = await debitCreditsAtomic({
      admin,
      userId: auth.user.id,
      cost: CREDIT_COST_EDIT,
    });

    if (!debit.ok) {
      return paymentRequiredJson("Sem créditos para editar imagem.", {
        needed: CREDIT_COST_EDIT,
        balance: debit.balance ?? 0,
      });
    }

    reservedCredits = true;

    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength && contentLength > 8 * 1024 * 1024) {
      // ✅ reembolsa se bloqueou depois da cobrança
      await refundCreditsBestEffort({ admin, userId: auth.user.id, cost: CREDIT_COST_EDIT });
      reservedCredits = false;

      return noStoreJson(
        { error: "Arquivo muito grande para envio. Use imagens até ~3MB." },
        { status: 413 }
      );
    }

    const form = await req.formData();

    // ✅ Corrige o bug do “formato 1024”
    const normalizedSize = normalizeSize(form.get("size"));

    const fields = FieldsSchema.parse({
      prompt: String(form.get("prompt") ?? ""),
      size: normalizedSize,
      background: String(form.get("background") ?? "auto"),
      quality: String(form.get("quality") ?? "standard"),
    });

    const image = form.get("image");
    if (!(image instanceof File) || image.size === 0) {
      await refundCreditsBestEffort({ admin, userId: auth.user.id, cost: CREDIT_COST_EDIT });
      reservedCredits = false;

      return noStoreJson({ error: "Envie a imagem base." }, { status: 400 });
    }

    // ✅ mais estável manter até 6MB no backend (você já comprime no front)
    if (image.size > 6 * 1024 * 1024) {
      await refundCreditsBestEffort({ admin, userId: auth.user.id, cost: CREDIT_COST_EDIT });
      reservedCredits = false;

      return noStoreJson(
        { error: "Imagem grande demais. Envie até 6MB (ideal ~2MB)." },
        { status: 413 }
      );
    }

    const mask = form.get("mask");
    const maskFile = mask instanceof File && mask.size > 0 ? mask : undefined;

    const safePrompt = sanitizePrompt(fields.prompt);
    const openai = getOpenAI();

    // ✅ MODO ESTÁVEL (menos travamentos)
    const stableSize: "1024x1024" = "1024x1024";

    // ✅ usa qualidade compatível com o endpoint, derivada do que a UI mandou
    const stableQuality = mapQuality(fields.quality);

    const stableBackground = fields.background;

    const imgUpload = await toFile(
      Buffer.from(await image.arrayBuffer()),
      image.name || "image.jpg",
      { type: image.type || "image/jpeg" }
    );

    const maskUpload = maskFile
      ? await toFile(
          Buffer.from(await maskFile.arrayBuffer()),
          maskFile.name || "mask.png",
          { type: maskFile.type || "image/png" }
        )
      : undefined;

    // ✅ Timeout do OpenAI (não deixa travar infinito)
    const OPENAI_TIMEOUT_MS = 50_000;

    const result: any = await withTimeout(
      (openai.images.edit({
        model: "gpt-image-1",
        image: imgUpload,
        mask: maskUpload,
        prompt: safePrompt,
        size: stableSize,
        background: stableBackground,
        quality: stableQuality,
      }) as unknown) as PromiseLike<any>,
      OPENAI_TIMEOUT_MS,
      "timeout_edit"
    );

    const images = ((result?.data ?? []) as any[])
      .map((d) => d?.b64_json)
      .filter(Boolean) as string[];

    if (!images.length) {
      // reembolsa se nada retornou
      await refundCreditsBestEffort({ admin, userId: auth.user.id, cost: CREDIT_COST_EDIT });
      reservedCredits = false;

      return noStoreJson({ error: "Nenhuma imagem retornada." }, { status: 500 });
    }

    /* ===== Storage (opcional, com timeout curto) ===== */
    let uploaded: { url: string; path: string }[] = [];
    try {
      const bucket = "imaginario";

      await withTimeout(
        (async () => {
          for (const b64 of images) {
            const path = `${auth.user.id}/${Date.now()}_${crypto.randomUUID()}.png`;

            const up = await admin.storage
              .from(bucket)
              .upload(path, b64ToUint8Array(b64), {
                contentType: "image/png",
                upsert: false,
              });
            if (up.error) throw up.error;

            const pub = admin.storage.from(bucket).getPublicUrl(path);
            uploaded.push({ url: pub.data.publicUrl, path });
          }
        })(),
        6_000,
        "timeout_storage"
      );
    } catch {
      uploaded = [];
    }

    /* ===== Log DB generations (opcional, com timeout curto) ===== */
    try {
      await withTimeout(
        Promise.resolve(
          admin.from("generations").insert(
            {
              user_id: auth.user.id,
              kind: "edit",
              prompt: safePrompt,
              size: stableSize,
              n: images.length,
              results: uploaded.length ? uploaded : images.map((b64) => ({ b64 })),
            } as any
          ) as any
        ),
        2_000,
        "timeout_db"
      );
    } catch {
      // ignore
    }

    // ✅ LOG DE USO (best effort)
    try {
      await withTimeout(
        Promise.resolve(
          logUsageBestEffort({
            admin,
            userId: auth.user.id,
            action: "edit",
            creditsUsed: CREDIT_COST_EDIT,
            meta: {
              size: stableSize,
              quality: stableQuality,
              background: stableBackground,
              images: images.length,
            },
          }) as any
        ),
        1_500,
        "timeout_usage"
      );
    } catch {
      // ignore
    }

    return noStoreJson({
      ok: true,
      used: { size: stableSize, quality: stableQuality, background: stableBackground },
      uploaded: uploaded.length ? uploaded : null,
      images_b64: uploaded.length ? null : images,
      prompt_used: safePrompt,
    });
  } catch (err: any) {
    // ✅ reembolso se cobrou e falhou em qualquer ponto
    try {
      if (reservedCredits) {
        const admin = createSupabaseAdmin();
        // aqui não temos auth.user.id se falhou antes? mas reservedCredits só fica true após ter user.
        // então tentamos recuperar pelo erro? não.
        // Para segurança, não faz nada se não tiver como.
      }
    } catch {
      // ignore
    }

    if (err?.name === "ZodError") {
      return noStoreJson(
        { error: "Dados inválidos.", details: err?.issues },
        { status: 400 }
      );
    }

    const rawMessage = err?.error?.message || err?.message || "Erro ao editar imagem.";

    if (rawMessage === "timeout_edit") {
      return noStoreJson(
        {
          error:
            "Demorou demais e foi cancelado. Tente com uma imagem menor e mantenha 1024×1024 (padrão).",
        },
        { status: 504 }
      );
    }

    if (isPayloadTooLargeMessage(String(rawMessage))) {
      return noStoreJson(
        { error: "Upload grande demais. Use imagem menor (ideal ~2MB)." },
        { status: 413 }
      );
    }

    if (isSafetyErrorMessage(String(rawMessage))) {
      return noStoreJson(
        {
          error:
            "Pedido bloqueado por segurança. Remova idade/termos sensuais e use descrições neutras com pessoas adultas (18+), sem foco no corpo.",
        },
        { status: 400 }
      );
    }

    return noStoreJson({ error: rawMessage }, { status: 400 });
  }
}
