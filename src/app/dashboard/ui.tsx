"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import {
  Download,
  ImagePlus,
  Sparkles,
  Upload,
  Wand2,
  ChevronRight,
  Image as ImageIcon,
  Clock,
  Info,
  Layers,
  RefreshCw,
  Coins,
  AlertTriangle,
  X,
} from "lucide-react";

type Generated = { url?: string; b64?: string; path?: string };

type HistoryRow = {
  id: string;
  created_at: string;
  kind: "generate" | "edit";
  prompt: string;
  size: string;
  n: number;
  results: unknown;
};

/* =========================
   MONETIZAÇÃO (UI)
========================= */

// custos iguais aos do backend
const CREDIT_COST_EDIT = 2;
const CREDIT_COST_PER_IMAGE = 1;
const CREDIT_EXTRA_HD_PER_IMAGE = 1;

function calcGenerateCost(n: number, quality: "standard" | "hd") {
  const base = n * CREDIT_COST_PER_IMAGE;
  const extra = quality === "hd" ? n * CREDIT_EXTRA_HD_PER_IMAGE : 0;
  return base + extra;
}

/* =========================
   UI HELPERS
========================= */

function Toggle({
  checked,
  onChange,
  label,
  helper,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  helper?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-100">{label}</div>
        {helper ? (
          <div className="mt-0.5 text-xs text-zinc-400">{helper}</div>
        ) : null}
      </div>
      <button
        type="button"
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className={[
          "relative h-7 w-12 shrink-0 rounded-full border border-white/10 transition",
          checked ? "bg-fuchsia-500/40" : "bg-white/10",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-soft transition",
            checked ? "left-5" : "left-0.5",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

function dataUrlFromB64(b64: string) {
  return `data:image/png;base64,${b64}`;
}

/**
 * ✅ HISTÓRICO: normaliza `results` vindo do Supabase para virar Generated[]
 * Aceita:
 * - [{ url, path }] (storage)
 * - [{ b64 }] (fallback)
 * - ["...b64..."] (caso antigo)
 * - null/undefined
 */
function normalizeResults(results: unknown): Generated[] {
  if (!results) return [];
  if (!Array.isArray(results)) return [];

  const out: Generated[] = [];

  for (const it of results) {
    // formato: { url, path } ou { b64 }
    if (it && typeof it === "object") {
      const obj = it as Record<string, unknown>;
      const url = typeof obj.url === "string" ? obj.url : undefined;
      const path = typeof obj.path === "string" ? obj.path : undefined;
      const b64 = typeof obj.b64 === "string" ? obj.b64 : undefined;

      if (url || b64) out.push({ url, path, b64 });
      continue;
    }

    // formato: "b64string"
    if (typeof it === "string" && it.length > 0) {
      out.push({ b64: it });
    }
  }

  return out;
}

async function fileFromInput(input: HTMLInputElement): Promise<File | null> {
  const f = input.files?.[0];
  return f ?? null;
}

/**
 * Lê resposta com segurança:
 * - suporta JSON
 * - suporta texto/HTML (ex: 413 Request Entity Too Large)
 * - evita "Unexpected token ..."
 */
async function safeReadJson(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();

  let json: any = null;
  if (contentType.includes("application/json")) {
    try {
      json = JSON.parse(text);
    } catch {
      // ignore
    }
  } else {
    try {
      json = JSON.parse(text);
    } catch {
      // ignore
    }
  }

  return { text, json };
}

function isLikelySafetyBlockedMessage(msg: string) {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("rejected by the safety system") ||
    m.includes("safety_violations") ||
    m.includes("content policy") ||
    m.includes("content_policy") ||
    m.includes("policy") ||
    m.includes("safety")
  );
}

function isPayloadTooLargeMessage(msg: string) {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("request entity too large") ||
    m.includes("payload too large") ||
    m.includes("body exceeded") ||
    m.includes("413") ||
    m.includes("too large")
  );
}

/**
 * Sanitiza prompt para reduzir bloqueio por safety:
 * - remove idades explícitas
 * - remove termos sensuais comuns
 * - força "adultas (18+)" quando menciona pessoas
 */
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

  if (mentionsPeople && !/\bsem foco no corpo\b/i.test(p)) {
    p += " Sem foco no corpo.";
  }

  return p.trim();
}

/**
 * Ajuda extra pra reduzir bloqueio:
 * - adiciona sufixo seguro quando mencionar pessoas
 */
function applyPromptAssist(input: string) {
  const p0 = (input || "").trim();
  if (!p0) return p0;

  const mentionsPeople =
    /\b(mulher|mulheres|pessoa|pessoas|garota|garotas|homem|homens|casal|grupo)\b/i.test(
      p0
    );

  const suffix =
    " Pessoas adultas (18+), vestidas de forma discreta, sem nudez, sem conteúdo sexual, sem foco no corpo.";

  if (mentionsPeople && !/sem\s+conte[uú]do\s+sexual/i.test(p0)) {
    return `${p0}${suffix}`.trim();
  }

  return p0;
}

/**
 * Fetch com timeout + abort
 */
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

function isHeic(file: File) {
  const n = (file.name || "").toLowerCase();
  const t = (file.type || "").toLowerCase();
  return (
    t.includes("heic") ||
    t.includes("heif") ||
    n.endsWith(".heic") ||
    n.endsWith(".heif")
  );
}

/**
 * Comprime imagem grande do celular (client)
 */
async function compressImageFile(
  file: File,
  opts?: {
    maxSide?: number;
    quality?: number;
    mime?: "image/jpeg" | "image/webp";
    targetMaxMB?: number;
    minQuality?: number;
    maxTries?: number;
  }
): Promise<File> {
  const maxSide0 = opts?.maxSide ?? 1280;
  const mime = opts?.mime ?? "image/jpeg";
  const targetMaxMB = opts?.targetMaxMB ?? 1.8;
  const maxTries = opts?.maxTries ?? 5;
  const minQuality = opts?.minQuality ?? 0.55;

  if (file.size <= targetMaxMB * 1024 * 1024) return file;

  const img = document.createElement("img");
  const url = URL.createObjectURL(file);

  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Falha ao ler imagem."));
  });

  img.src = url;
  await loaded;

  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;

  const scale0 = Math.min(1, maxSide0 / Math.max(w0, h0));
  let nw = Math.max(1, Math.round(w0 * scale0));
  let nh = Math.max(1, Math.round(h0 * scale0));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(url);
    throw new Error("Canvas não suportado neste aparelho.");
  }

  let quality = opts?.quality ?? 0.78;
  let blob: Blob | null = null;

  for (let i = 0; i < maxTries; i++) {
    canvas.width = nw;
    canvas.height = nh;
    ctx.clearRect(0, 0, nw, nh);
    ctx.drawImage(img, 0, 0, nw, nh);

    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Falha ao comprimir imagem."))),
        mime,
        quality
      );
    });

    const mb = blob.size / 1024 / 1024;
    if (mb <= targetMaxMB) break;

    quality = Math.max(minQuality, quality - 0.08);

    if (i >= 2) {
      nw = Math.max(1, Math.round(nw * 0.9));
      nh = Math.max(1, Math.round(nh * 0.9));
    }
  }

  URL.revokeObjectURL(url);

  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  const newName = `${baseName}${mime === "image/webp" ? ".webp" : ".jpg"}`;

  return new File([blob!], newName, { type: mime });
}

function validateMaskPng(mask: File) {
  const ok = mask.type === "image/png" || mask.name.toLowerCase().endsWith(".png");
  if (!ok) throw new Error("A máscara precisa ser PNG.");
}

function Segmented({
  value,
  onChange,
}: {
  value: "generate" | "edit" | "history";
  onChange: (v: "generate" | "edit" | "history") => void;
}) {
  const items: Array<{ k: typeof value; label: string; icon: any }> = [
    { k: "generate", label: "Gerar", icon: Sparkles },
    { k: "edit", label: "Editar", icon: Wand2 },
    { k: "history", label: "Histórico", icon: ImagePlus },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/5 p-1">
      {items.map((it) => {
        const Icon = it.icon;
        const active = it.k === value;
        return (
          <button
            key={it.k}
            type="button"
            onClick={() => onChange(it.k)}
            className={[
              "flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm transition",
              active
                ? "bg-white text-zinc-900 shadow-[0_12px_35px_-18px_rgba(255,255,255,0.35)]"
                : "text-zinc-200 hover:bg-white/10",
            ].join(" ")}
          >
            <Icon className="h-4 w-4" />
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function PresetChips({ onPick }: { onPick: (text: string) => void }) {
  const presets = [
    {
      t: "Retrato realista • luz suave • fundo desfocado • 35mm • alto detalhe",
      add: "Retrato realista de uma pessoa adulta (18+), luz suave, fundo desfocado, 35mm, alto detalhe, pele natural, foto profissional.",
    },
    {
      t: "Logo minimalista • neon/glow • fundo escuro",
      add: "Logo minimalista, símbolo moderno, estilo premium, neon glow sutil, fundo escuro, alto contraste, tipografia limpa, 1:1.",
    },
    {
      t: "Produto e-commerce • estúdio • reflexo leve",
      add: "Foto de produto em estúdio, iluminação softbox, fundo clean, reflexo leve, ultra nítido, aparência premium, 1:1.",
    },
    {
      t: "Arte 3D • isométrico • cores vibrantes",
      add: "Cena 3D isométrica, cores vibrantes, iluminação cinematográfica, alto detalhe, render limpo, 1:1.",
    },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((p) => (
        <button
          key={p.t}
          type="button"
          onClick={() => onPick(p.add)}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200 hover:bg-white/10"
          title="Aplicar preset"
        >
          {p.t}
        </button>
      ))}
    </div>
  );
}

function ResultGrid({
  results,
  onDownload,
}: {
  results: Generated[];
  onDownload: (it: Generated) => Promise<void>;
}) {
  if (!results.length) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
        Nenhum resultado ainda. Gere ou edite para aparecer aqui.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {results.map((it, idx) => {
        const src = it.url || (it.b64 ? dataUrlFromB64(it.b64) : "");
        return (
          <div
            key={idx}
            className="group relative overflow-hidden rounded-3xl border border-white/10 bg-black"
          >
            {src ? (
              <Image
                src={src}
                alt="resultado"
                width={1024}
                height={1024}
                className="h-auto w-full object-cover transition duration-300 group-hover:scale-[1.01]"
                unoptimized={!!it.b64}
              />
            ) : null}

            <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
              <div className="absolute -inset-24 bg-fuchsia-500/10 blur-3xl" />
              <div className="absolute -inset-24 bg-blue-500/10 blur-3xl" />
            </div>

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/85 to-transparent p-3">
              <Button variant="secondary" onClick={() => onDownload(it)}>
                <Download className="h-4 w-4" />
                Baixar
              </Button>
              {it.url ? (
                <a
                  className="text-xs text-zinc-300 underline underline-offset-4"
                  href={it.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir
                </a>
              ) : (
                <span className="text-xs text-zinc-400">base64</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =========================
   PAYWALL MODAL (COMPLETO)
========================= */

type PaywallContext =
  | { action: "generate"; needed: number }
  | { action: "edit"; needed: number };

function PaywallModal({
  open,
  onClose,
  balance,
  ctx,
}: {
  open: boolean;
  onClose: () => void;
  balance: number | null;
  ctx: PaywallContext | null;
}) {
  if (!open) return null;

  const needed = ctx?.needed ?? 0;
  const actionLabel = ctx?.action === "edit" ? "Editar" : "Gerar";
  const bal = Number.isFinite(balance as any) ? (balance as number) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl">
        <div className="pointer-events-none absolute inset-0 opacity-60">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
          <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
        </div>

        <div className="relative p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="grid gap-1">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <AlertTriangle className="h-4 w-4 text-red-300" />
                Saldo insuficiente
              </div>
              <p className="text-xs text-zinc-400">
                Para <b>{actionLabel}</b> você precisa de <b>{needed}</b> crédito
                {needed === 1 ? "" : "s"}.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 bg-white/5 p-2 text-zinc-200 hover:bg-white/10"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">Seu saldo</span>
                <span className="font-semibold text-white">
                  {bal === null ? "—" : bal}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-zinc-300">Necessário agora</span>
                <span className="font-semibold text-white">{needed}</span>
              </div>
            </div>

            <div className="grid gap-2">
              <Button
                onClick={() => {
                  toast.message("Conecte aqui seu checkout (Stripe/Mercado Pago).");
                }}
              >
                <Coins className="h-4 w-4" />
                Comprar créditos
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Fechar
              </Button>

              <p className="text-[11px] leading-relaxed text-zinc-400">
                Dica: comece com geração <b>1024×1024</b> e <b>n=1</b> para gastar menos
                e evitar travamentos.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================
   MAIN COMPONENT
========================= */

export default function DashboardClient({ userEmail }: { userEmail: string }) {
  const [tab, setTab] = useState<"generate" | "edit" | "history">("generate");
  const [loading, setLoading] = useState(false);
  const inFlightRef = useRef(false);

  // ✅ ref da área de prévia (para rolar no mobile)
  const previewRef = useRef<HTMLDivElement | null>(null);

  function scrollToPreview() {
    setTimeout(() => {
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function showInPreview(imgs: Generated[]) {
    setResults(imgs);
    toast.message("Carreguei as imagens na prévia.");
    scrollToPreview();
  }

  // state do assistente de prompt (usado no Generate e no Edit)
  const [promptAssist, setPromptAssist] = useState(true);

  // monetização: saldo (UI)
  const [credits, setCredits] = useState<number | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);

  // paywall modal
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallCtx, setPaywallCtx] = useState<PaywallContext | null>(null);

  // generate
  const [prompt, setPrompt] = useState(
    "Retrato realista de uma pessoa adulta (18+), luz suave, fundo desfocado, 35mm, alto detalhe."
  );
  const [size, setSize] = useState("1024x1024");
  const [quality, setQuality] = useState<"standard" | "hd">("hd");
  const [background, setBackground] = useState<"auto" | "transparent" | "opaque">(
    "auto"
  );
  const [n, setN] = useState(1);

  // edit
  const [editPrompt, setEditPrompt] = useState(
    "Troque o fundo por um cenário de estúdio com luz rosa, mantendo o rosto e a pose."
  );
  const [editSize, setEditSize] = useState("1024x1024");
  const [editQuality, setEditQuality] = useState<"standard" | "hd">("standard");
  const [editBackground, setEditBackground] = useState<
    "auto" | "transparent" | "opaque"
  >("auto");

  const [results, setResults] = useState<Generated[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const signedInLabel = useMemo(() => userEmail || "logado", [userEmail]);

  // custo atual na UI
  const generateCost = useMemo(() => calcGenerateCost(n, quality), [n, quality]);
  const editCost = CREDIT_COST_EDIT;

  const hasCreditsInfo = credits !== null && Number.isFinite(credits);
  const canGenerateWithBalance = !hasCreditsInfo || (credits as number) >= generateCost;
  const canEditWithBalance = !hasCreditsInfo || (credits as number) >= editCost;

  function openPaywall(ctx: PaywallContext) {
    setPaywallCtx(ctx);
    setPaywallOpen(true);
  }

  async function loadCredits(showToast = false) {
    try {
      setCreditsLoading(true);

      const res = await fetchWithTimeout("/api/billing/credits", { method: "GET" }, 20_000);
      const { text, json } = await safeReadJson(res);

      if (!res.ok) {
        throw new Error(json?.error ?? text ?? "Falha ao carregar créditos.");
      }

      const bal = Number(json?.balance ?? 0);
      const safeBal = Number.isFinite(bal) ? bal : 0;
      setCredits(safeBal);

      if (showToast) toast.success("Saldo atualizado.");
    } catch {
      setCredits(null);
      if (showToast) toast.error("Não consegui carregar seus créditos.");
    } finally {
      setCreditsLoading(false);
    }
  }

  async function loadHistory() {
    const { data, error } = await supabase
      .from("generations")
      .select("id, created_at, kind, prompt, size, n, results")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) return;

    const rows = (data ?? []) as unknown as HistoryRow[];
    setHistory(rows);
  }

  useEffect(() => {
    loadCredits(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "history") loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function onGenerate() {
    if (inFlightRef.current) return;

    // trava se sem créditos (quando sabemos o saldo)
    if (hasCreditsInfo && !canGenerateWithBalance) {
      openPaywall({ action: "generate", needed: generateCost });
      return;
    }

    inFlightRef.current = true;
    setLoading(true);
    setResults([]);

    try {
      const rawPrompt = (prompt ?? "").trim();
      if (rawPrompt.length < 3) {
        throw new Error("Digite um prompt com pelo menos 3 caracteres.");
      }

      let safePrompt = sanitizePrompt(rawPrompt);
      if (promptAssist) safePrompt = applyPromptAssist(safePrompt);

      if (safePrompt !== rawPrompt) {
        toast.message("Ajustei seu prompt para evitar bloqueio de segurança.");
      }

      const res = await fetchWithTimeout(
        "/api/image/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: safePrompt,
            size,
            n,
            quality,
            background,
          }),
        },
        90_000
      );

      const { text, json } = await safeReadJson(res);

      if (!res.ok) {
        if (res.status === 402) {
          await loadCredits(false);
          openPaywall({ action: "generate", needed: generateCost });
          return;
        }

        const msg = json?.error ?? text ?? "Falha ao gerar.";
        if (isLikelySafetyBlockedMessage(msg)) {
          throw new Error(
            "Bloqueado por segurança. Evite idade/termos sensuais e use descrição neutra."
          );
        }
        if (isPayloadTooLargeMessage(msg)) {
          throw new Error("Resposta grande demais (413). Gere 1 imagem (n=1) e use 1024×1024.");
        }
        throw new Error(msg);
      }

      const out: Generated[] = json?.uploaded
        ? json.uploaded.map((x: any) => ({ url: x.url, path: x.path }))
        : (json?.images_b64 || []).map((b64: string) => ({ b64 }));

      setResults(out);
      toast.success("Imagem gerada!");

      // ✅ joga o usuário pra prévia no mobile
      scrollToPreview();

      await loadCredits(false);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        toast.error("Demorou demais e foi cancelado. Tente de novo.");
      } else {
        toast.error(err?.message ?? "Erro.");
      }
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }

  async function onEdit(imageFile: File, maskFile?: File | null) {
    if (inFlightRef.current) return;

    if (hasCreditsInfo && !canEditWithBalance) {
      openPaywall({ action: "edit", needed: editCost });
      return;
    }

    inFlightRef.current = true;
    setLoading(true);
    setResults([]);

    try {
      const rawEditPrompt = (editPrompt ?? "").trim();
      if (rawEditPrompt.length < 3) {
        throw new Error("Digite instruções de edição com pelo menos 3 caracteres.");
      }
      if (!imageFile || imageFile.size === 0) {
        throw new Error("Escolha uma imagem válida.");
      }

      if (isHeic(imageFile)) {
        throw new Error("Seu arquivo é HEIC/HEIF. Converta para JPG/PNG.");
      }

      if (maskFile) validateMaskPng(maskFile);

      let safeEditPrompt = sanitizePrompt(rawEditPrompt);
      if (promptAssist) safeEditPrompt = applyPromptAssist(safeEditPrompt);

      if (safeEditPrompt !== rawEditPrompt) {
        toast.message("Ajustei seu texto para evitar bloqueio de segurança.");
      }

      // Estabilidade: força padrão no EDIT (sua rota também força)
      const forcedSize = "1024x1024";
      const forcedQuality: "standard" = "standard";
      const forcedBackground = editBackground;

      if (editQuality === "hd") {
        toast.message("No EDIT vou usar Standard para não travar no Vercel.");
      }

      const originalMB = imageFile.size / 1024 / 1024;
      const compressed = await compressImageFile(imageFile, {
        maxSide: 1280,
        quality: 0.78,
        mime: "image/jpeg",
        targetMaxMB: 1.8,
        minQuality: 0.55,
        maxTries: 5,
      });
      const compressedMB = compressed.size / 1024 / 1024;

      if (compressed !== imageFile) {
        toast.message(
          `Otimizando imagem: ${originalMB.toFixed(1)}MB → ${compressedMB.toFixed(1)}MB`
        );
      }

      const fd = new FormData();
      fd.set("prompt", safeEditPrompt);
      fd.set("size", forcedSize);
      fd.set("quality", forcedQuality);
      fd.set("background", forcedBackground);
      fd.set("image", compressed);
      if (maskFile) fd.set("mask", maskFile);

      const res = await fetchWithTimeout("/api/image/edit", { method: "POST", body: fd }, 120_000);
      const { text, json } = await safeReadJson(res);

      if (!res.ok) {
        if (res.status === 402) {
          await loadCredits(false);
          openPaywall({ action: "edit", needed: editCost });
          return;
        }

        const msg = json?.error ?? text ?? "Falha ao editar.";

        if (isPayloadTooLargeMessage(msg)) {
          throw new Error("Upload grande demais (413). Use imagem menor.");
        }
        if (isLikelySafetyBlockedMessage(msg)) {
          throw new Error(
            "Bloqueado por segurança. Use: 'pessoas adultas (18+), roupas discretas, sem foco no corpo'."
          );
        }

        throw new Error(msg);
      }

      const out: Generated[] = json?.uploaded
        ? json.uploaded.map((x: any) => ({ url: x.url, path: x.path }))
        : (json?.images_b64 || []).map((b64: string) => ({ b64 }));

      setResults(out);
      toast.success("Edição concluída!");

      // ✅ joga o usuário pra prévia no mobile
      scrollToPreview();

      await loadCredits(false);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        toast.error("Demorou demais e foi cancelado. Use uma imagem menor.");
      } else {
        toast.error(err?.message ?? "Erro.");
      }
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }

  // ✅ download melhor no Android
  async function download(item: Generated) {
    try {
      if (item.b64) {
        const a = document.createElement("a");
        a.href = dataUrlFromB64(item.b64);
        a.download = "imagem.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }

      if (item.url) {
        const res = await fetch(item.url, { cache: "no-store" });
        if (!res.ok) throw new Error("Falha ao baixar.");

        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = objectUrl;

        const ext = blob.type.includes("png")
          ? "png"
          : blob.type.includes("webp")
          ? "webp"
          : "jpg";

        a.download = `imagem.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();

        URL.revokeObjectURL(objectUrl);
        return;
      }

      toast.error("Sem arquivo para baixar.");
    } catch {
      if (item.url) {
        window.open(item.url, "_blank", "noopener,noreferrer");
        toast.message("Abri a imagem. Se não baixar automático, use o menu do navegador.");
        return;
      }
      toast.error("Não consegui baixar.");
    }
  }

  const panelTitle =
    tab === "generate" ? "Geração" : tab === "edit" ? "Edição" : "Histórico";

  return (
    <>
      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        balance={credits}
        ctx={paywallCtx}
      />

      <div className="grid gap-6">
        {/* Top bar */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-2">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200">
              <ImageIcon className="h-4 w-4" />
              Studio • {panelTitle}
              <ChevronRight className="h-4 w-4 opacity-60" />
              <span className="text-zinc-300">{signedInLabel}</span>
            </div>

            {/* Créditos */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200">
                <Coins className="h-4 w-4 text-yellow-200" />
                {creditsLoading ? (
                  <span className="text-zinc-300">Carregando créditos...</span>
                ) : credits === null ? (
                  <span className="text-zinc-300">Créditos: —</span>
                ) : (
                  <span className="text-zinc-200">
                    Créditos: <b className="text-white">{credits}</b>
                  </span>
                )}
              </div>

              <Button
                variant="secondary"
                onClick={() => loadCredits(true)}
                disabled={creditsLoading}
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar saldo
              </Button>

              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200">
                <Info className="h-4 w-4" />
                {tab === "generate" ? (
                  <span>
                    Custo agora: <b>{generateCost}</b>
                  </span>
                ) : tab === "edit" ? (
                  <span>
                    Custo agora: <b>{editCost}</b>
                  </span>
                ) : (
                  <span>Custos variam por ação</span>
                )}
              </div>

              {hasCreditsInfo &&
              ((tab === "generate" && !canGenerateWithBalance) ||
                (tab === "edit" && !canEditWithBalance)) ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs text-red-200">
                  <AlertTriangle className="h-4 w-4" />
                  Saldo insuficiente
                </div>
              ) : null}
            </div>

            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="text-sm text-zinc-300">
              Gere e edite com estabilidade (mobile + Vercel).
            </p>
          </div>
          <Segmented value={tab} onChange={setTab} />
        </div>

        {/* Main layout: controls + preview */}
        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          {/* LEFT: controls */}
          <div className="grid gap-6">
            {tab === "generate" && (
              <Card className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="grid gap-1">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Sparkles className="h-4 w-4 text-fuchsia-300" />
                      Gerar imagem
                    </div>
                    <div className="text-xs text-zinc-400">
                      Dica: 1024×1024 e n=1 é o modo mais estável.
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <Toggle
                    checked={promptAssist}
                    onChange={setPromptAssist}
                    label="Assistente de prompt (recomendado)"
                    helper="Reduz bloqueios usando linguagem neutra e segura."
                  />

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs text-zinc-300">
                      <Layers className="h-4 w-4" />
                      Presets rápidos
                    </div>
                    <PresetChips onPick={(t) => setPrompt(t)} />
                  </div>

                  <label className="grid gap-1 text-sm">
                    <span className="text-zinc-300">Prompt</span>
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      className="min-h-[140px]"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1 text-sm">
                      <span className="text-zinc-300">Tamanho</span>
                      <Select value={size} onChange={(e) => setSize(e.target.value)}>
                        <option value="1024x1024">1024×1024</option>
                        <option value="1024x1536">1024×1536</option>
                        <option value="1536x1024">1536×1024</option>
                      </Select>
                    </label>

                    <label className="grid gap-1 text-sm">
                      <span className="text-zinc-300">Qualidade</span>
                      <Select
                        value={quality}
                        onChange={(e) => setQuality(e.target.value as any)}
                      >
                        <option value="standard">Standard</option>
                        <option value="hd">HD</option>
                      </Select>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1 text-sm">
                      <span className="text-zinc-300">Fundo</span>
                      <Select
                        value={background}
                        onChange={(e) => setBackground(e.target.value as any)}
                      >
                        <option value="auto">Auto</option>
                        <option value="transparent">Transparente</option>
                        <option value="opaque">Opaco</option>
                      </Select>
                    </label>

                    <label className="grid gap-1 text-sm">
                      <span className="text-zinc-300">Variações</span>
                      <Select
                        value={String(n)}
                        onChange={(e) => setN(Number(e.target.value))}
                      >
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                      </Select>
                    </label>
                  </div>

                  <Button
                    onClick={onGenerate}
                    disabled={loading || (hasCreditsInfo && !canGenerateWithBalance)}
                  >
                    <Sparkles className="h-4 w-4" />
                    {hasCreditsInfo && !canGenerateWithBalance
                      ? `Sem créditos (precisa ${generateCost})`
                      : loading
                      ? "Gerando..."
                      : `Gerar imagem (${generateCost} crédito${
                          generateCost === 1 ? "" : "s"
                        })`}
                  </Button>

                  <div className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-zinc-300">
                    <Info className="mt-0.5 h-4 w-4 text-zinc-200" />
                    <div>
                      Se der erro, reduza para <b>1024×1024</b> e <b>n=1</b>. Evite prompts
                      com idade explícita.
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {tab === "edit" && (
              <EditPanelPremium
                loading={loading}
                editPrompt={editPrompt}
                setEditPrompt={setEditPrompt}
                editSize={editSize}
                setEditSize={setEditSize}
                editQuality={editQuality}
                setEditQuality={setEditQuality}
                editBackground={editBackground}
                setEditBackground={setEditBackground}
                onEdit={onEdit}
                promptAssist={promptAssist}
                setPromptAssist={setPromptAssist}
                editCost={editCost}
                canEdit={!(hasCreditsInfo && !canEditWithBalance)}
              />
            )}

            {tab === "history" && (
              <Card className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="grid gap-1">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Clock className="h-4 w-4 text-emerald-300" />
                      Histórico
                    </div>
                    <div className="text-xs text-zinc-400">
                      Mostra até 30 itens (depende da tabela no Supabase).
                    </div>
                  </div>
                  <Button variant="secondary" onClick={loadHistory}>
                    <RefreshCw className="h-4 w-4" />
                    Atualizar
                  </Button>
                </div>

                <div className="mt-4 grid gap-3">
                  {history.length === 0 ? (
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
                      Sem histórico ainda.
                    </div>
                  ) : (
                    history.map((h) => {
                      const imgs = normalizeResults(h.results);
                      const thumbs = imgs.slice(0, 4);

                      return (
                        <div
                          key={h.id}
                          className="rounded-3xl border border-white/10 bg-white/5 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm">
                              <span className="font-semibold">
                                {h.kind === "edit" ? "Edição" : "Geração"}
                              </span>{" "}
                              <span className="text-zinc-400">
                                • {new Date(h.created_at).toLocaleString()}
                              </span>
                            </div>
                            <div className="text-xs text-zinc-400">
                              {h.size} • n={h.n}
                            </div>
                          </div>

                          <div className="mt-2 text-sm text-zinc-200">{h.prompt}</div>

                          {/* ✅ thumbnails */}
                          {thumbs.length > 0 ? (
                            <div className="mt-3 grid grid-cols-4 gap-2">
                              {thumbs.map((it, idx) => {
                                const src =
                                  it.url || (it.b64 ? dataUrlFromB64(it.b64) : "");
                                return (
                                  <button
                                    key={`${h.id}_${idx}`}
                                    type="button"
                                    className="relative overflow-hidden rounded-2xl border border-white/10 bg-black"
                                    onClick={() => showInPreview(imgs)}
                                    title="Ver na prévia"
                                  >
                                    {src ? (
                                      <Image
                                        src={src}
                                        alt="thumb"
                                        width={256}
                                        height={256}
                                        className="h-20 w-full object-cover"
                                        unoptimized={!!it.b64}
                                      />
                                    ) : (
                                      <div className="h-20 w-full" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="mt-3 text-xs text-zinc-400">
                              (Sem imagem salva nesta geração)
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              variant="secondary"
                              onClick={() => showInPreview(imgs)}
                              disabled={imgs.length === 0}
                            >
                              <ImagePlus className="h-4 w-4" />
                              Ver na prévia
                            </Button>

                            <Button
                              variant="secondary"
                              onClick={() => download(imgs[0])}
                              disabled={imgs.length === 0}
                            >
                              <Download className="h-4 w-4" />
                              Baixar 1ª
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* RIGHT: preview */}
          <div className="grid gap-6">
            {/* ✅ wrapper com ref para rolar até aqui */}
            <div ref={previewRef}>
              <Card className="relative overflow-hidden p-6">
                <div className="pointer-events-none absolute inset-0 opacity-70">
                  <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-fuchsia-500/10 blur-3xl" />
                  <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
                </div>

                <div className="relative flex items-center justify-between gap-3">
                  <div className="grid gap-1">
                    <div className="text-sm font-semibold">Prévia / Resultados</div>
                    <div className="text-xs text-zinc-400">
                      Seus resultados aparecem aqui (com download rápido).
                    </div>
                  </div>

                  <div className="hidden items-center gap-2 md:flex">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200">
                      {tab === "generate"
                        ? "Geração"
                        : tab === "edit"
                        ? "Edição"
                        : "Histórico"}
                    </span>
                  </div>
                </div>

                {loading && (
                  <div className="relative mt-4 overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-fuchsia-400" />
                      Processando...
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="h-40 animate-pulse rounded-2xl bg-white/5" />
                      <div className="h-40 animate-pulse rounded-2xl bg-white/5" />
                    </div>
                    <p className="mt-3 text-xs text-zinc-400">
                      Se demorar demais, tente <b>1024×1024</b>, <b>n=1</b> e imagem menor.
                    </p>
                  </div>
                )}

                <div className="relative mt-4">
                  <ResultGrid results={results} onDownload={download} />
                </div>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-fuchsia-300" />
                  Dica de prompt
                </div>
                <p className="mt-2 text-sm text-zinc-300">
                  Quanto mais claro, melhor: <b>estilo</b>, <b>luz</b>, <b>câmera</b>,{" "}
                  <b>fundo</b> e <b>qualidade</b>.
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Upload className="h-4 w-4 text-blue-300" />
                  Dica de edição
                </div>
                <p className="mt-2 text-sm text-zinc-300">
                  Use fotos menores. Se o celular salvar em <b>HEIC</b>, converta para JPG.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* =========================
   EDIT PANEL PREMIUM
========================= */

function EditPanelPremium(props: {
  loading: boolean;
  editPrompt: string;
  setEditPrompt: (v: string) => void;
  editSize: string;
  setEditSize: (v: string) => void;
  editQuality: "standard" | "hd";
  setEditQuality: (v: any) => void;
  editBackground: "auto" | "transparent" | "opaque";
  setEditBackground: (v: any) => void;
  onEdit: (imageFile: File, maskFile?: File | null) => Promise<void>;
  promptAssist: boolean;
  setPromptAssist: (v: boolean) => void;

  editCost: number;
  canEdit: boolean;
}) {
  const [imageElId] = useState(() => `img_${Math.random().toString(16).slice(2)}`);
  const [maskElId] = useState(() => `msk_${Math.random().toString(16).slice(2)}`);

  async function onPickAndSend() {
    const imgInput = document.getElementById(imageElId) as HTMLInputElement | null;
    const maskInput = document.getElementById(maskElId) as HTMLInputElement | null;
    if (!imgInput) return;

    const imageFile = await fileFromInput(imgInput);
    const maskFile = maskInput ? await fileFromInput(maskInput) : null;

    if (!imageFile) {
      toast.error("Escolha uma imagem.");
      return;
    }

    await props.onEdit(imageFile, maskFile);
  }

  return (
    <Card className="p-6">
      <div className="grid gap-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Wand2 className="h-4 w-4 text-blue-300" />
          Editar imagem
        </div>
        <div className="text-xs text-zinc-400">
          Modo estável: no backend o EDIT usa <b>1024×1024</b> e <b>Standard</b>.
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <Toggle
          checked={props.promptAssist}
          onChange={props.setPromptAssist}
          label="Assistente de prompt (recomendado)"
          helper="Reduz bloqueios usando linguagem neutra e segura."
        />

        <label className="grid gap-1 text-sm">
          <span className="text-zinc-300">Instruções de edição</span>
          <Textarea
            value={props.editPrompt}
            onChange={(e) => props.setEditPrompt(e.target.value)}
            className="min-h-[120px]"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-300">Tamanho</span>
            <Select
              value={props.editSize}
              onChange={(e) => props.setEditSize(e.target.value)}
              disabled
            >
              <option value="1024x1024">1024×1024 (fixo)</option>
              <option value="1024x1536">1024×1536</option>
              <option value="1536x1024">1536×1024</option>
            </Select>
            <p className="text-xs text-zinc-500">Fixado para evitar travamentos.</p>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-zinc-300">Qualidade</span>
            <Select
              value={props.editQuality}
              onChange={(e) => props.setEditQuality(e.target.value)}
              disabled
            >
              <option value="standard">Standard (fixo)</option>
              <option value="hd">HD</option>
            </Select>
            <p className="text-xs text-zinc-500">Fixado para estabilidade no Vercel.</p>
          </label>
        </div>

        <label className="grid gap-1 text-sm">
          <span className="text-zinc-300">Fundo</span>
          <Select
            value={props.editBackground}
            onChange={(e) => props.setEditBackground(e.target.value)}
          >
            <option value="auto">Auto</option>
            <option value="transparent">Transparente</option>
            <option value="opaque">Opaco</option>
          </Select>
        </label>

        <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="grid gap-1 text-sm">
            <span className="text-zinc-200">Imagem base</span>
            <Input id={imageElId} type="file" accept="image/png,image/jpeg,image/webp,image/jpg" />
            <p className="text-xs text-zinc-500">Evite HEIC/HEIF.</p>
          </div>

          <div className="grid gap-1 text-sm">
            <span className="text-zinc-200">Máscara (opcional)</span>
            <Input id={maskElId} type="file" accept="image/png" />
            <p className="text-xs text-zinc-400">
              PNG com transparência indica a área a modificar.
            </p>
          </div>
        </div>

        <Button onClick={onPickAndSend} disabled={props.loading || !props.canEdit}>
          <Upload className="h-4 w-4" />
          {!props.canEdit
            ? `Sem créditos (precisa ${props.editCost})`
            : props.loading
            ? "Editando..."
            : `Enviar e editar (${props.editCost} créditos)`}
        </Button>

        <div className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-zinc-300">
          <Info className="mt-0.5 h-4 w-4 text-zinc-200" />
          <div>
            Se aparecer “demorou demais”, use uma imagem menor. Screenshots costumam funcionar melhor que fotos enormes.
          </div>
        </div>
      </div>
    </Card>
  );
}
