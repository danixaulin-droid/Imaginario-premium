"use client";

import { useMemo } from "react";
import { X, Coins, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type PaywallModalProps = {
  open: boolean;
  onClose: () => void;
  balance: number;
  needed: number;
  actionLabel?: string; // "Gerar" ou "Editar"
  userEmail?: string;
};

const WHATSAPP_NUMBER = "5517996559435"; // <- troque se quiser
function buildWhatsAppLink(message: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export default function PaywallModal({
  open,
  onClose,
  balance,
  needed,
  actionLabel = "continuar",
  userEmail = "",
}: PaywallModalProps) {
  const deficit = Math.max(0, needed - balance);

  // ✅ pacotes (você pode ajustar como quiser)
  const packs = useMemo(
    () => [
      { id: "starter", title: "Starter", credits: 30, hint: "pra testar e curtir", badge: "Mais vendido" },
      { id: "pro", title: "Pro", credits: 80, hint: "pra usar todo dia", badge: "Melhor custo" },
      { id: "ultra", title: "Ultra", credits: 200, hint: "pra uso pesado", badge: "Premium" },
    ],
    []
  );

  if (!open) return null;

  const msg = `Olá! Quero comprar créditos no Imaginário Premium.
Email: ${userEmail || "(não informado)"}
Preciso de +${deficit} créditos para ${actionLabel}.
Saldo atual: ${balance} | Custo: ${needed}`;

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* overlay */}
      <button
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      {/* modal */}
      <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200">
              <Coins className="h-4 w-4 text-yellow-300" />
              Paywall • Créditos
            </div>
            <h2 className="mt-2 text-xl font-semibold text-zinc-100">
              Saldo insuficiente
            </h2>
            <p className="mt-1 text-sm text-zinc-300">
              Você tem <b>{balance}</b> crédito(s) e precisa de <b>{needed}</b>.
              <span className="text-zinc-400"> Falta </span>
              <b className="text-fuchsia-200">{deficit}</b>.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-zinc-200 hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* packs */}
        <div className="mt-4 grid gap-3">
          {packs.map((p) => (
            <div
              key={p.id}
              className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4"
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-fuchsia-500/10 blur-2xl" />
              <div className="pointer-events-none absolute -left-16 -bottom-16 h-40 w-40 rounded-full bg-blue-500/10 blur-2xl" />

              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold text-zinc-100">{p.title}</div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-200">
                      {p.badge}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-zinc-300">
                    <b>{p.credits}</b> créditos • <span className="text-zinc-400">{p.hint}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-zinc-400">Sugerido</div>
                  <div className="text-sm font-semibold text-zinc-100">
                    {p.credits >= deficit ? "✅ resolve agora" : "➕ ajuda bastante"}
                  </div>
                </div>
              </div>

              <div className="relative mt-3 flex flex-col gap-2 sm:flex-row">
                <Button
                  className="w-full"
                  onClick={() => {
                    const link = buildWhatsAppLink(`${msg}\n\nQuero o pacote: ${p.title} (${p.credits} créditos).`);
                    window.open(link, "_blank", "noreferrer");
                  }}
                >
                  Comprar {p.credits} créditos
                </Button>

                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    const link = buildWhatsAppLink(`${msg}\n\nQuero saber os valores e formas de pagamento.`);
                    window.open(link, "_blank", "noreferrer");
                  }}
                >
                  Falar no WhatsApp
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* footer tips */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-zinc-300">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 text-fuchsia-300" />
            <div>
              <b>Dica:</b> 1024×1024 e n=1 gasta menos e é mais estável.
              <div className="mt-1 flex items-center gap-2 text-zinc-400">
                <Wand2 className="h-3.5 w-3.5" />
                Edição costuma custar mais por ser mais pesada.
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Entendi
          </Button>
        </div>
      </div>
    </div>
  );
}
