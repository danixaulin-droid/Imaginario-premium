import { NextResponse } from "next/server";
import { z } from "zod";
import { getOpenAI } from "@/lib/openai";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { toFile } from "openai/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/* =========================
   MONETIZAÇÃO (CRÉDITOS)
   - RPC é opcional
   - fallback: select -> update
========================= */
const CREDIT_COST_EDIT = 2; // ajuste se quiser

function paymentRequiredJson(message: string, extra?: any) {
  return NextResponse.json(
    { error: message, code: "INSUFFICIENT_CREDITS", ...extra },
    { status: 402, headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

async function debitCreditsAtomic(params: {
  admin: ReturnType<typeof createSupabaseAdmin>;
  userId: string;
  cost: number;
}) {
  const { admin, userId, cost } = params;

  // 1) tenta RPC (se existir no seu SQL)
  // ✅ FIX: cast para any evita erro de tipagem quando Database não declara a RPC
  try {
    const rpc = await (admin as any).rpc("debit_credits", {
      p_user_id: userId,
      p_cost: cost,
    });
    if (!rpc?.error) {
      const newBalance = (rpc?.data ?? null) as number | null;
      if (newBalance === null || Number.isNaN(newBalance)) throw new Error("RPC inválido");
      return { ok: true as const, newBalance };
    }
  } catch {
    // ignora e cai no fallback
  }

  // 2) fallback: select -> update
  const { data: row, error: selErr } = await admin
    .from("user_credits")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (selErr) throw selErr;

  const balance = Number((row as any)?.balance ?? 0);
  if (!Number.isFinite(balance) || balance < cost) {
    return { ok: false as const, balance: Number.isFinite(balance) ? balance : 0 };
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

  // tenta RPC
  // ✅ FIX: cast para any evita erro de tipagem quando Database não declara a RPC
  try {
    const rpc = await (admin as any).rpc("refund_credits", {
      p_user_id: userId,
      p_cost: cost,
    });
    if (!rpc?.error) return;
  } catch {
    // ignore
  }

  // fallback
  try {
    const { data: row } = await admin
      .from("user_credits")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();

    const balance = Number((row as any)?.balance ?? 0);
    const newBalance = (Number.isFinite(balance) ? balance : 0) + cost;

    await admin.from("user_credits").update({ balance: newBalance }).eq("user_id", userId);
  } catch {
    // ignore
  }
}

/* =========================
   HELPERS
========================= */
function normalizeSize(raw: unknown) {
  let s = String(raw ?? "1024x1024").trim();
  s = s.replace(/×/g, "x");
  if (/^\d+$/.test(s)) s = `${s}x${s}`;
  if (!/^\d+x\d+$/.test(s)) s = "1024x1024";
  if (s !== "1024x1024" && s !== "1024x1536" && s !== "1536x1024") s = "1024x1024";
  return s as "1024x1024" | "1024x1536" | "1536x1024";
}

const FieldsSchema = z.object({
  prompt: z.string().min(3).max(2000),
  size: z.enum(["1024x1024", "1024x1536", "1536x1024"]).default("1024x1024"),
  background: z.enum(["auto", "transparent", "opaque"]).default("auto"),
  quality: z.enum(["standard", "hd", "auto", "low", "medium", "high"]).default("standard"),
});

// endpoint de edit aceita: auto | low | medium | high
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
  let charged = false;
  let chargedUserId: string | null = null;
  let chargedCost = 0;

  try {
    const supabase = await createSupabaseServer();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return noStoreJson({ error: "Não autenticado." }, { status: 401 });
    }

    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength && contentLength > 8 * 1024 * 1024) {
      return noStoreJson(
        { error: "Arquivo muito grande para envio. Use imagens até ~3MB." },
        { status: 413 }
      );
    }

    const form = await req.formData();
    const normalizedSize = normalizeSize(form.get("size"));

    const fields = FieldsSchema.parse({
      prompt: String(form.get("prompt") ?? ""),
      size: normalizedSize,
      background: String(form.get("background") ?? "auto"),
      quality: String(form.get("quality") ?? "standard"),
    });

    const image = form.get("image");
    if (!(image instanceof File) || image.size === 0) {
      return noStoreJson({ error: "Envie a imagem base." }, { status: 400 });
    }

    if (image.size > 6 * 1024 * 1024) {
      return noStoreJson(
        { error: "Imagem grande demais. Envie até 6MB (ideal ~2MB)." },
        { status: 413 }
      );
    }

    const mask = form.get("mask");
    const maskFile = mask instanceof File && mask.size > 0 ? mask : undefined;

    // ✅ cobra créditos antes
    const admin = createSupabaseAdmin();
    const cost = CREDIT_COST_EDIT;

    const debit = await debitCreditsAtomic({
      admin,
      userId: auth.user.id,
      cost,
    });

    if (!debit.ok) {
      return paymentRequiredJson("Sem créditos para editar imagens.", {
        needed: cost,
        balance: (debit as any).balance ?? 0,
      });
    }

    charged = true;
    chargedUserId = auth.user.id;
    chargedCost = cost;

    const safePrompt = sanitizePrompt(fields.prompt);
    const openai = getOpenAI();

    // ✅ modo estável
    const stableSize: "1024x1024" = "1024x1024";
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
      await refundCreditsBestEffort({ admin, userId: auth.user.id, cost });
      charged = false;
      chargedUserId = null;
      chargedCost = 0;

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

            const up = await admin.storage.from(bucket).upload(path, b64ToUint8Array(b64), {
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

    /* ===== Log DB (opcional) ===== */
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

    return noStoreJson({
      ok: true,
      charged: { credits: cost },
      used: { size: stableSize, quality: stableQuality, background: stableBackground },
      uploaded: uploaded.length ? uploaded : null,
      images_b64: uploaded.length ? null : images,
      prompt_used: safePrompt,
    });
  } catch (err: any) {
    // ✅ reembolso best-effort se já cobrou e falhou
    try {
      if (charged && chargedUserId && chargedCost > 0) {
        const admin = createSupabaseAdmin();
        await refundCreditsBestEffort({
          admin,
          userId: chargedUserId,
          cost: chargedCost,
        });
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
