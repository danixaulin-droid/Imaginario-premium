import { Suspense } from "react";
import AuthClient from "./AuthClient";

export const dynamic = "force-dynamic";

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="p-6 text-zinc-300">Carregando…</div>}>
      <AuthClient />
    </Suspense>
  );
}
