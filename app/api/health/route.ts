import { sql } from "drizzle-orm";
import { db, dbConfigured } from "@/lib/db";

/**
 * Configuration health check.
 *
 * Reports presence, not values — booleans and a table count, never a
 * connection string or a key. Exists because Vercel resolves environment
 * variables at build time, so "I added the variable and redeployed" and "the
 * running deployment can use it" are separate claims that are otherwise
 * indistinguishable from outside.
 *
 * Safe to delete once the setup has settled.
 */
export const dynamic = "force-dynamic";

export async function GET() {
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

  const ready =
    env.DATABASE_URL &&
    env.AUTH_SECRET &&
    env.AUTH_GOOGLE_ID &&
    env.AUTH_GOOGLE_SECRET &&
    database.reachable &&
    missing.length === 0;

  return Response.json(
    {
      ready,
      env,
      database,
      missingTables: missing,
      hint: ready
        ? "Auth and database are configured."
        : !env.DATABASE_URL
        ? "DATABASE_URL is not visible to this build. Check the name is exact and that Production is ticked, then redeploy."
        : !database.reachable
        ? "DATABASE_URL is set but the query failed. Check the string is the full pooled URL including ?sslmode=require."
        : missing.length
        ? `Connected, but these tables are missing: ${missing.join(", ")}. Run the SQL in Neon's SQL Editor.`
        : "Some auth variables are missing — see env above.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
