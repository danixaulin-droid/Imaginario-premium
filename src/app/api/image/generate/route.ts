import { NextResponse } from "next/server";
import { z } from "zod";
import { getOpenAI } from "@/lib/openai";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  prompt: z.string().min(3).max(2000),
  size: z.enum(["1024x1024", "1024x1536", "1536x1024"]).default("1024x1024"),
  n: z.number().int().min(1).max(4).default(1),
  background: z.enum(["auto", "transparent", "opaque"]).default("auto"),
  quality: z.enum(["standard", "hd"]).default("standard"),
});

// gpt-image-1 aceita: "standard" | "high"
function mapQuality(q: "standard" | "hd"): "standard" | "high" {
  return q === "hd" ? "high" : "standard";
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
    p = `Pessoas adultas (18+) de forma discreta. ${p}`;
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

async function withTimeout<T>(p: Promise<T>, ms: number, label = "timeout") {
  let t: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(label)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
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

    const json = await req.json();
    const body = BodySchema.parse(json);

    const safePrompt = sanitizePrompt(body.prompt);

    const openai = getOpenAI();

    // ✅ TIPAGEM: força result como any pra TS não quebrar no build
    const result: any = await withTimeout(
      (openai.images.generate({
        model: "gpt-image-1",
        prompt: safePrompt,
        size: body.size,
        n: body.n,
        background: body.background,
        quality: mapQuality(body.quality),
      }) as unknown) as Promise<any>,
      55_000,
      "timeout_generate"
    );

    const images = ((result?.data ?? []) as any[])
      .map((d) => d?.b64_json)
      .filter(Boolean) as string[];

    if (!images.length) {
      return noStoreJson({ error: "Nenhuma imagem retornada." }, { status: 500 });
    }

    // Upload no Supabase Storage (opcional)
    let uploaded: Array<{ url: string; path: string }> = [];
    try {
      const admin = createSupabaseAdmin();
      const bucket = "imaginario";

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
    } catch {
      // storage opcional: se falhar, devolve base64
    }

    // Log no banco (opcional) — evita TS never
    try {
      const admin = createSupabaseAdmin();
      await admin.from("generations").insert(
        {
          user_id: auth.user.id,
          kind: "generate",
          prompt: safePrompt,
          size: body.size,
          n: body.n,
          results: uploaded.length ? uploaded : images.map((b64) => ({ b64 })),
        } as any
      );
    } catch {
      // ignore
    }

    return noStoreJson({
      ok: true,
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

    const status =
      err?.status ??
      err?.response?.status ??
      (typeof err?.code === "number" ? err.code : 400);

    const rawMessage = err?.error?.message || err?.message || "Erro ao gerar imagem.";

    const requestId =
      err?.request_id ||
      err?.response?.headers?.get?.("x-request-id") ||
      err?.headers?.get?.("x-request-id") ||
      null;

    if (rawMessage === "timeout_generate") {
      return noStoreJson(
        {
          error:
            "A geração demorou demais e foi cancelada. Tente novamente (use 1024x1024 e gere 1 imagem por vez).",
          request_id: requestId,
        },
        { status: 504 }
      );
    }

    if (isPayloadTooLargeMessage(String(rawMessage))) {
      return noStoreJson(
        {
          error:
            "A resposta ficou grande demais e foi bloqueada. Tente gerar 1 imagem por vez e mantenha o tamanho em 1024.",
          request_id: requestId,
        },
        { status: 413 }
      );
    }

    if (isSafetyErrorMessage(String(rawMessage))) {
      return noStoreJson(
        {
          error:
            "Seu pedido foi bloqueado pelo sistema de segurança. Remova idade/termos sensuais e descreva de forma neutra (pessoas adultas 18+), sem foco no corpo.",
          request_id: requestId,
        },
        { status: 400 }
      );
    }

    return noStoreJson(
      { error: rawMessage, request_id: requestId },
      { status: status >= 400 && status <= 599 ? status : 400 }
    );
  }
}
