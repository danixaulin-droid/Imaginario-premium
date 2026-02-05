import { createClient } from "@supabase/supabase-js";
import { mustEnv } from "@/lib/env";

/**
 * Supabase Admin (Service Role)
 * - Usado apenas no backend
 * - Necessário para Storage e inserts sem RLS
 * - Singleton para evitar múltiplas instâncias
 */
let adminClient: ReturnType<typeof createClient> | null = null;

export function createSupabaseAdmin() {
  if (adminClient) return adminClient;

  const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return adminClient;
}
