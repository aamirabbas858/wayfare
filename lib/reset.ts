import "server-only";

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { passwordResetTokens } from "@/lib/db/schema";

/**
 * Password reset tokens.
 *
 * Only a SHA-256 hash of the token is stored. Read access to the database
 * therefore does not grant the ability to reset anyone's password, which is
 * the same reasoning that applies to storing passwords hashed — a reset token
 * is a temporary credential and deserves the same treatment.
 */

const TTL_MINUTES = 30;

export function createToken() {
  // 32 bytes of CSPRNG output. Base64url so it survives being put in a URL.
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export async function storeToken(userId: string, hash: string) {
  const expires = new Date(Date.now() + TTL_MINUTES * 60_000);
  await db.insert(passwordResetTokens).values({ token: hash, userId, expires });
  return expires;
}

/**
 * Returns the userId when the token is valid, unused and unexpired.
 *
 * The comparison is constant-time. The lookup is by hash so this is not
 * strictly necessary, but the cost is negligible and it removes a class of
 * mistake if the lookup ever changes.
 */
export async function consumeToken(raw: string): Promise<string | null> {
  const hash = hashToken(raw);

  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.token, hash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expires, new Date())
      )
    )
    .limit(1);

  if (!row) return null;

  const a = Buffer.from(row.token);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Marked rather than deleted, so a second click on the same link can say
  // "already used" instead of the same message as a forged token.
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.token, hash));

  return row.userId;
}

/** Invalidates every outstanding token for a user, used after a successful
 *  reset so a leaked older link cannot be replayed. */
export async function revokeTokens(userId: string) {
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokens.userId, userId),
        isNull(passwordResetTokens.usedAt)
      )
    );
}

/* ── Email ──────────────────────────────────────────────────────────── */

export async function sendResetEmail(to: string, link: string) {
  const key = process.env.AUTH_RESEND_KEY;
  if (!key) {
    console.error("[reset] AUTH_RESEND_KEY missing — cannot send");
    return false;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // resend.dev is Resend's shared sender. It only delivers to the address
      // that owns the account until a domain is verified.
      from: "Wayfare <onboarding@resend.dev>",
      to,
      subject: "Reset your Wayfare password",
      text: [
        "Someone asked to reset the password for this Wayfare account.",
        "",
        `Open this link within ${TTL_MINUTES} minutes:`,
        link,
        "",
        "If that was not you, ignore this email — nothing has changed.",
      ].join("\n"),
      html: resetEmailHtml(link),
    }),
  });

  if (!res.ok) {
    // Logged, never surfaced: the body can name the account and the recipient.
    console.error(`[reset] resend ${res.status}:`, (await res.text()).slice(0, 300));
    return false;
  }
  return true;
}

function resetEmailHtml(link: string) {
  return `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#F5F2EC;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">
  <table role="presentation" style="max-width:480px;margin:0 auto;background:#FDFCFA;border:1px solid rgba(11,18,17,.1);border-radius:14px;">
    <tr><td style="padding:32px;">
      <div style="font-size:20px;font-weight:700;color:#0B1211;margin-bottom:24px;">
        wayfare<span style="color:#E4572E;">.</span>
      </div>
      <h1 style="margin:0 0 12px;font-size:20px;color:#0B1211;">Reset your password</h1>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:rgba(11,18,17,.65);">
        Someone asked to reset the password for this account. This link works
        once and expires in ${TTL_MINUTES} minutes.
      </p>
      <a href="${link}" style="display:inline-block;background:#E4572E;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:600;">
        Choose a new password
      </a>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.7;color:rgba(11,18,17,.45);">
        If this was not you, ignore this email. Nothing has changed and your
        current password still works.
      </p>
    </td></tr>
  </table>
</body></html>`;
}
