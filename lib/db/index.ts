import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

/**
 * Database client.
 *
 * neon-http speaks to Neon over HTTP rather than a TCP pool, which is what
 * serverless functions want: there is no connection to keep alive between
 * invocations and nothing to exhaust when Vercel scales out.
 *
 * Neon scales an idle project to zero and wakes it on the next query in well
 * under a second, so the site does not need a manual restore after a quiet
 * week the way a paused Supabase project would.
 */

const url = process.env.DATABASE_URL;

/** True when a database is configured. Auth and saving degrade rather than
 *  crash without one — planning a trip must keep working regardless. */
export const dbConfigured = Boolean(url);

// Deliberately not throwing at import time. A missing DATABASE_URL should
// disable the features that need it, not take down the whole deployment
// including the planner, which has no database dependency at all.
export const db = url
  ? drizzle(neon(url), { schema })
  : (null as unknown as ReturnType<typeof drizzle>);

export { schema };
