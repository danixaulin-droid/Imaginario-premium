import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function PricingPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Planos</h1>
        <p className="text-sm text-zinc-300">
          Esta tela já está pronta para você plugar assinatura (Stripe/Mercado Pago) depois.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-6">
          <h3 className="font-semibold">Free</h3>
          <p className="mt-1 text-sm text-zinc-300">Teste e valide.</p>
          <ul className="mt-4 grid gap-2 text-sm text-zinc-200">
            <li>• 5 gerações / dia</li>
            <li>• Qualidade standard</li>
            <li>• Sem histórico avançado</li>
          </ul>
          <Button className="mt-5 w-full" variant="secondary" disabled>
            Em breve
          </Button>
        </Card>

        <Card className="p-6 border-fuchsia-400/30">
          <div className="inline-flex w-fit rounded-full bg-fuchsia-500/20 px-3 py-1 text-xs text-fuchsia-200">
            Recomendado
          </div>
          <h3 className="mt-3 font-semibold">Pro</h3>
          <p className="mt-1 text-sm text-zinc-300">Para criadores.</p>
          <ul className="mt-4 grid gap-2 text-sm text-zinc-200">
            <li>• 200 gerações / mês</li>
            <li>• Qualidade HD</li>
            <li>• Edição com máscara</li>
          </ul>
          <Button className="mt-5 w-full" disabled>
            Conectar checkout depois
          </Button>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold">Studio</h3>
          <p className="mt-1 text-sm text-zinc-300">Para equipes e admins.</p>
          <ul className="mt-4 grid gap-2 text-sm text-zinc-200">
            <li>• Limites maiores</li>
            <li>• Painel admin</li>
            <li>• Logs e auditoria</li>
          </ul>
          <Button className="mt-5 w-full" variant="secondary" disabled>
            Em breve
          </Button>
        </Card>
      </div>
    </div>
  );
}
