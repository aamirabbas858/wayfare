import { NextRequest } from "next/server";
import { hashPassword, signUpSchema } from "@/lib/auth";
import { dbConfigured } from "@/lib/db";
import { createUser, findUserByEmail } from "@/lib/db/queries";

/**
 * Creates an email/password account.
 *
 * Sign-in itself is handled by Auth.js; this only exists because the
 * Credentials provider verifies people who already exist and has no notion of
 * registration.
 */
export async function POST(request: NextRequest) {
  if (!dbConfigured) {
    return Response.json(
      { error: "Accounts are unavailable right now." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = signUpSchema.safeParse(body);
  if (!parsed.success) {
    // First message only. Returning the whole issue list encourages clients to
    // render a wall of errors when the user has one thing to fix.
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Check your details." },
      { status: 400 }
    );
  }

  const { name, email, password } = parsed.data;

  try {
    const existing = await findUserByEmail(email);
    if (existing) {
      // Deliberately explicit. Hiding this would mean silently doing nothing
      // when someone signs up twice, and they would sit waiting for an email
      // that is not coming. The address is one the person already typed.
      return Response.json(
        {
          error:
            "An account with this email already exists. Sign in instead.",
          code: "EXISTS",
        },
        { status: 409 }
      );
    }

    await createUser({ name, email, passwordHash: await hashPassword(password) });

    // No session is issued here. The client signs in immediately afterwards
    // through Auth.js, so there is exactly one path that creates a session.
    return Response.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[signup]", err);
    return Response.json(
      { error: "Could not create the account. Please try again." },
      { status: 500 }
    );
  }
}
