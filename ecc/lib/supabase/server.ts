import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/** Per-request server client bound to the signed-in user's session cookies (RLS applies). */
export async function supabaseServer() {
  const store = await cookies();
  const { url, anonKey } = publicEnv();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* read-only in RSC */ }
      },
    },
  });
}
