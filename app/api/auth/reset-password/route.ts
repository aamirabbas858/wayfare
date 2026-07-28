import { NextRequest } from "next/server";
import { z } from "zod";
import { dbConfigured } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { setPassword } from "@/lib/db/queries";
import { consumeToken, revokeTokens } from "@/lib/reset";

const schema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
});

export async function POST(request: NextRequest) {
  if (!dbConfigured) {
    return Response.json({ error: "Unavailable." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Check your details." },
      { status: 400 }
    );
  }

  try {
    const userId = await consumeToken(parsed.data.token);
    if (!userId) {
      return Response.json(
        { error: "That link has expired or has already been used." },
        { status: 400 }
      );
    }

    await setPassword(userId, await hashPassword(parsed.data.password));
    // Any other outstanding link is now void, so an older email that leaked
    // cannot be replayed after the password has changed.
    await revokeTokens(userId);

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[reset-password]", err);
    return Response.json({ error: "Could not reset the password." }, { status: 500 });
  }
}
