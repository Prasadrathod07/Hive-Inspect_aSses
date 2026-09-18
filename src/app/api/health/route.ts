import { createServiceRoleClient } from "@/lib/supabase/server-client";

/**
 * Deployment health check. Answers one question only: "is this deployment
 * correctly configured and able to reach its database?" — never "does it
 * have data yet." A freshly-deployed, un-seeded app is healthy; a
 * misconfigured or unreachable one is not. Conflating the two would make
 * this useless for the one thing it exists for (catching a bad deploy
 * before a reviewer does).
 *
 * Reports structural facts only — configured/reachable booleans, never a
 * credential value, and never a raw database error. Same public-safe
 * posture as everything else in this app (docs/decision-log.md D12): this
 * route has no auth, so anything it returns is visible to the whole
 * internet.
 *
 * Node runtime: the Supabase client needs it (same as /api/import).
 */
export const runtime = "nodejs";
// Always reflect live state — never cache a health check.
export const dynamic = "force-dynamic";

interface HealthChecks {
  /** Both required env vars are present. Says nothing about whether they're *valid*. */
  supabaseConfigured: boolean;
  /** A real query against Postgres succeeded. Only attempted if configured. */
  supabaseReachable: boolean;
}

async function checkSupabase(): Promise<HealthChecks> {
  let client;
  try {
    client = createServiceRoleClient();
  } catch {
    return { supabaseConfigured: false, supabaseReachable: false };
  }

  // Cheapest possible real query: count with a hard row cap, hitting an
  // index-only path. Proves the network path, credentials, and schema all
  // work — not just that env vars are set.
  const { error } = await client.from("templates").select("id", { count: "exact", head: true }).limit(1);

  return { supabaseConfigured: true, supabaseReachable: !error };
}

export async function GET(): Promise<Response> {
  const checks = await checkSupabase();
  const healthy = checks.supabaseConfigured && checks.supabaseReachable;

  return Response.json(
    {
      status: healthy ? "ok" : "unavailable",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
