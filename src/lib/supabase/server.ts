import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { mustEnv } from "@/lib/env";

type CookieToSet = {
  name: string;
  value: string;
  options?: any;
};

export async function createSupabaseServer() {
  // ✅ No seu build do Vercel, cookies() está tipado como Promise
  const cookieStore = await cookies();

  return createServerClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Em alguns contextos (Server Components) set pode falhar — ok ignorar
          }
        },
      },
    }
  );
}
