import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import DashboardClient from "./ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ✅ se não estiver logado, vai pro login
  if (!user) {
    redirect("/auth");
  }

  return <DashboardClient userEmail={user.email ?? ""} />;
}
