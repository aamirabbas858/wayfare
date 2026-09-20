import { sql } from "drizzle-orm";
import { db, dbConfigured } from "@/lib/db";
import { probeProviders, providerStatus } from "@/lib/llm";

/**
 * Configuration health check.
 *
 * Reports presence, not values — booleans and a table count, never a
 * connection string or a key. Exists because Vercel resolves environment
 * variables at build time, so "I added the variable and redeployed" and "the
 * running deployment can use it" are separate claims that are otherwise
 * indistinguishable from outside.
 *
 * Planning providers are reported here too. This route once answered
 * ready: true through a total planning outage, because it only knew about
 * the database and auth — the one subsystem that was down was the one it
 * could not see.
 *
 * `?probe=1` goes further and asks each configured model for a few real
 * tokens. Presence is not health: in the 20 Sep 2026 outage every key was
 * present and every model behind it was dead, and one of them answered 200
 * while streaming nothing at all. Only asking for tokens catches that, so it
 * costs a little and stays opt-in.
 *
 * Safe to delete once the setup has settled.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const wantsProbe = new URL(request.url).searchParams.get("probe") === "1";
  const providers = providerStatus();
  const probe = wantsProbe ? await probeProviders() : null;
  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    AUTH_SECRET: Boolean(process.env.AUTH_SECRET),
    AUTH_GOOGLE_ID: Boolean(process.env.AUTH_GOOGLE_ID),
    AUTH_GOOGLE_SECRET: Boolean(process.env.AUTH_GOOGLE_SECRET),
    AUTH_RESEND_KEY: Boolean(process.env.AUTH_RESEND_KEY),
  };

  let database: {
    reachable: boolean;
    tables?: string[];
    error?: string;
  } = { reachable: false };

  if (dbConfigured) {
    try {
      // Also confirms the tables were actually created, which a plain
      // "SELECT 1" would not — a reachable but empty database looks healthy
      // right up until the first sign-in fails.
      const rows = await db.execute(sql`
        select table_name from information_schema.tables
        where table_schema = 'public'
        order by table_name
      `);
      const list = (rows.rows ?? rows) as unknown as { table_name: string }[];
      database = { reachable: true, tables: list.map((r) => r.table_name) };
    } catch (err) {
      // The message can name the host, so it is logged rather than returned.
      console.error("[health] database unreachable:", err);
      database = {
        reachable: false,
        error: "Could not query the database. See server logs.",
      };
    }
  }

  const expected = [
    "account",
    "passwordResetToken",
    "session",
    "trip",
    "user",
    "verificationToken",
  ];
  const missing = database.tables
    ? expected.filter((t) => !database.tables!.includes(t))
    : expected;

  // Planning is the product. A build that cannot reach a single provider is
  // not ready, however healthy its database looks.
  const anyProvider = providers.some((p) => p.configured);
  const liveModels = probe?.filter((r) => r.ok).length ?? null;

  const ready =
    env.DATABASE_URL &&
    env.AUTH_SECRET &&
    env.AUTH_GOOGLE_ID &&
    env.AUTH_GOOGLE_SECRET &&
    database.reachable &&
    missing.length === 0 &&
    anyProvider &&
    liveModels !== 0;

  return Response.json(
    {
      ready,
      env,
      database,
      missingTables: missing,
      providers,
      ...(probe && { probe }),
      hint: ready
        ? probe
          ? `Auth, database and ${liveModels} of ${probe.length} models are working.`
          : "Auth and database are configured. Add ?probe=1 to check the models actually answer."
        : !env.DATABASE_URL
        ? "DATABASE_URL is not visible to this build. Check the name is exact and that Production is ticked, then redeploy."
        : !database.reachable
        ? "DATABASE_URL is set but the query failed. Check the string is the full pooled URL including ?sslmode=require."
        : missing.length
        ? `Connected, but these tables are missing: ${missing.join(", ")}. Run the SQL in Neon's SQL Editor.`
        : !anyProvider
        ? "No planning provider key is visible to this build. Set one of the keys listed under providers, then redeploy — Vercel resolves them at build time."
        : liveModels === 0
        ? "Every provider key is present but no model answered. Model ids in lib/llm.ts have most likely gone stale — see probe for what each returned."
        : "Some auth variables are missing — see env above.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
