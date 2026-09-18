import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for server-side persistence only. The
 * `server-only` import makes it a build error to pull this into any client
 * component or client bundle. `SUPABASE_SERVICE_ROLE_KEY` has no
 * `NEXT_PUBLIC_` prefix, so Next.js never inlines it into client code
 * either way — this is defense in depth, not the only safeguard.
 *
 * Bypasses RLS entirely (that's the point — see the migration's RLS
 * comment). Never construct this client in response to unauthenticated
 * client input without server-side validation first.
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase server credentials are not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
