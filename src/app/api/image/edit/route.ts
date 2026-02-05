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
      return noStoreJson({ error: "Envie a imagem base." }, { status: 400 });
    }

    // ✅ mais estável manter até 6MB no backend (você já comprime no front)
    if (image.size > 6 * 1024 * 1024) {
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
    // standard -> medium, hd -> high, ou auto/low/medium/high se você mandar direto
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
      return noStoreJson({ error: "Nenhuma imagem retornada." }, { status: 500 });
    }

    /* ===== Storage (opcional, com timeout curto) ===== */
    let uploaded: { url: string; path: string }[] = [];
    try {
      const admin = createSupabaseAdmin();
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

    /* ===== Log DB (opcional, com timeout curto) ===== */
    try {
      const admin = createSupabaseAdmin();

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
      used: { size: stableSize, quality: stableQuality, background: stableBackground },
      uploaded: uploaded.length ? uploaded : null,
      images_b64: uploaded.length ? null : images,
      prompt_used: safePrompt,
    });
  } catch (err: any) {
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
