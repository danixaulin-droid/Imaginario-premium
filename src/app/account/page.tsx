import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function AccountPage() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Minha conta</h1>
        <p className="text-sm text-zinc-300">Gerencie sua conta e sessão.</p>
      </div>

      <Card className="p-6">
        <div className="grid gap-2">
          <div className="text-sm text-zinc-400">Email</div>
          <div className="text-base">{user.email}</div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="secondary">
              Sair
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
