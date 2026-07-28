"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { Wordmark } from "@/components/Chrome";

const INPUT =
  "w-full rounded-xl border border-input bg-surface px-4 py-3 text-[0.95rem] " +
  "text-foreground placeholder:text-faint/60 outline-none transition-[border-color,box-shadow] " +
  "duration-200 focus:border-[var(--color-signal-500)] " +
  "focus:shadow-[0_0_0_3px_rgba(228,87,46,0.14)]";

const BUTTON =
  "flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-signal-500)] " +
  "px-6 py-3.5 text-[0.94rem] font-semibold text-white " +
  "shadow-[0_10px_30px_-8px_rgba(228,87,46,0.55)] transition-[background-color,transform] " +
  "duration-200 hover:bg-[var(--color-signal-600)] active:scale-[0.99] " +
  "disabled:cursor-not-allowed disabled:opacity-70";

/* ── Request a link ─────────────────────────────────────────────────── */

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setBusy(false);
        return;
      }
      // The server answers identically for registered and unregistered
      // addresses, so the UI must not imply the account exists either.
      setSent(true);
    } catch {
      setError("Could not reach the server. Check your connection.");
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="w-full max-w-[26rem]">
        <Link href="/" className="mb-10 inline-block">
          <Wordmark />
        </Link>
        <div className="mb-6 grid h-12 w-12 place-items-center rounded-xl bg-[var(--color-sage-500)]/12">
          <MailCheck className="h-5 w-5 text-[var(--color-sage-500)]" aria-hidden />
        </div>
        <h1 className="display mb-3 text-[clamp(1.7rem,4.5vw,2.2rem)] font-semibold">
          Check your email
        </h1>
        <p className="mb-8 text-[0.92rem] leading-relaxed text-faint">
          If <span className="text-foreground">{email}</span> has an account,
          a reset link is on its way. It works once and expires in 30 minutes.
        </p>
        <Link
          href="/signin"
          className="inline-flex items-center gap-2 text-[0.88rem] text-faint underline
                     underline-offset-4 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[26rem]">
      <Link href="/" className="mb-10 inline-block">
        <Wordmark />
      </Link>

      <h1 className="display mb-3 text-[clamp(1.8rem,5vw,2.4rem)] font-semibold">
        Forgot your password?
      </h1>
      <p className="mb-8 text-[0.92rem] leading-relaxed text-faint">
        Enter your email and we will send a link to choose a new one.
      </p>

      {error && (
        <div
          role="alert"
          className="animate-fade mb-6 rounded-xl border border-[var(--color-signal-500)]/35
                     bg-[var(--color-signal-500)]/[0.07] px-4 py-3 text-[0.86rem]"
        >
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-[0.84rem] font-medium">Email</span>
          <input
            type="email"
            required
            maxLength={255}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={INPUT}
          />
        </label>

        <button type="submit" disabled={busy} className={BUTTON}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Send reset link
        </button>
      </form>

      <p className="mt-7 text-center text-[0.88rem] text-faint">
        Remembered it?{" "}
        <Link
          href="/signin"
          className="font-medium text-foreground underline underline-offset-4
                     transition-colors hover:text-[var(--color-signal-500)]"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

/* ── Choose a new password ──────────────────────────────────────────── */

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <Shell title="That link is incomplete">
        <p className="mb-8 text-[0.92rem] leading-relaxed text-faint">
          The reset link is missing its token. Request a new one and open it
          directly from the email.
        </p>
        <Link href="/forgot-password" className={BUTTON}>
          Request a new link
        </Link>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell title="Password changed">
        <div className="mb-6 grid h-12 w-12 place-items-center rounded-xl bg-[var(--color-sage-500)]/12">
          <Check className="h-5 w-5 text-[var(--color-sage-500)]" aria-hidden />
        </div>
        <p className="mb-8 text-[0.92rem] leading-relaxed text-faint">
          You can sign in with your new password now. Any other reset links
          that were outstanding no longer work.
        </p>
        <Link href="/signin" className={BUTTON}>
          Sign in
        </Link>
      </Shell>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not reset the password.");
        setBusy(false);
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection.");
    }
    setBusy(false);
  }

  return (
    <Shell title="Choose a new password">
      <p className="mb-8 text-[0.92rem] leading-relaxed text-faint">
        At least 8 characters. Longer beats complicated.
      </p>

      {error && (
        <div
          role="alert"
          className="animate-fade mb-6 rounded-xl border border-[var(--color-signal-500)]/35
                     bg-[var(--color-signal-500)]/[0.07] px-4 py-3 text-[0.86rem]"
        >
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-[0.84rem] font-medium">New password</span>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              required
              minLength={8}
              maxLength={200}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className={`${INPUT} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center
                         rounded-lg text-faint transition-colors hover:text-foreground"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        <button type="submit" disabled={busy} className={BUTTON}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Set new password
        </button>
      </form>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[26rem]">
      <Link href="/" className="mb-10 inline-block">
        <Wordmark />
      </Link>
      <h1 className="display mb-3 text-[clamp(1.8rem,5vw,2.4rem)] font-semibold">
        {title}
      </h1>
      {children}
    </div>
  );
}
