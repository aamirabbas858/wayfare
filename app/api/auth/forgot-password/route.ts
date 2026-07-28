import { NextRequest } from "next/server";
import { z } from "zod";
import { dbConfigured } from "@/lib/db";
import { findUserByEmail } from "@/lib/db/queries";
import { createToken, storeToken, sendResetEmail } from "@/lib/reset";

const schema = z.object({ email: z.string().email().max(255) });

/**
 * Requests a reset link.
 *
 * Always answers the same way, whether or not the address is registered and
 * whether or not the email actually sent. Anything else turns this endpoint
 * into a way to enumerate accounts, and the person typing the address learns
 * nothing useful from a distinction they cannot act on.
 */
const SAME_ANSWER = {
  ok: true,
  message: "If that email has an account, a reset link is on its way.",
};

export async function POST(request: NextRequest) {
  if (!dbConfigured) return Response.json(SAME_ANSWER);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  // A malformed address is a client-side mistake worth reporting; an
  // unregistered but well-formed one is not.
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const user = await findUserByEmail(parsed.data.email);

    // OAuth-only accounts have no password to reset. Still answered
    // identically — telling someone "that account uses Google" reveals how
    // the address is registered.
    if (user?.passwordHash) {
      const { raw, hash } = createToken();
      await storeToken(user.id, hash);

      const origin =
        process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
      await sendResetEmail(user.email, `${origin}/reset-password?token=${raw}`);
    }
  } catch (err) {
    // Even a failure answers the same. The alternative leaks existence
    // through timing and status codes.
    console.error("[forgot-password]", err);
  }

  return Response.json(SAME_ANSWER);
}
