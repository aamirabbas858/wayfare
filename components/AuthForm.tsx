"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Wordmark } from "@/components/Chrome";

type Mode = "signin" | "signup";

/** Auth.js reports failures as opaque codes in the query string. */
const ERRORS: Record<string, string> = {
  CredentialsSignin: "That email and password do not match.",
  OAuthAccountNotLinked:
    "This email is already registered. Sign in with your password instead.",
  OAuthSignin: "Could not reach Google. Please try again.",
  OAuthCallback: "Google sign-in did not complete. Please try again.",
  AccessDenied: "Access was denied.",
  Configuration: "Sign-in is misconfigured. Please try again later.",
  Verification: "That link has expired. Please request a new one.",
};

const INPUT =
  "w-full rounded-xl border border-input bg-surface px-4 py-3 text-[0.95rem] " +
  "text-foreground placeholder:text-faint/60 outline-none transition-[border-color,box-shadow] " +
  "duration-200 focus:border-[var(--color-signal-500)] " +
  "focus:shadow-[0_0_0_3px_rgba(228,87,46,0.14)]";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const isSignup = mode === "signup";

  // Where to land afterwards. Restricted to same-site paths so the parameter
  // cannot be used to bounce someone to another origin after sign-in.
  const rawNext = params.get("callbackUrl") ?? "/dashboard";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//")
    ? rawNext
    : "/dashboard";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  const [busy, setBusy] = useState<null | "credentials" | "google">(null);
  const [error, setError] = useState<string | null>(
    ERRORS[params.get("error") ?? ""] ??
      (params.get("error") ? "Sign-in failed. Please try again." : null)
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("credentials");
    setError(null);

    try {
      if (isSignup) {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Could not create the account.");
          setBusy(null);
          return;
        }
      }

      // Both paths finish here, so a new account is signed in by exactly the
      // same mechanism as a returning one.
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(ERRORS[result.error] ?? "That email and password do not match.");
        setBusy(null);
        return;
      }

      router.push(next);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(null);
    }
  }

  return (
    <div className="w-full max-w-[26rem]">
      <Link href="/" className="mb-10 inline-block">
        <Wordmark />
      </Link>

      <h1 className="display mb-2 text-[clamp(1.9rem,5vw,2.5rem)] font-semibold">
        {isSignup ? "Create an account" : "Welcome back"}
      </h1>
      <p className="mb-8 text-[0.92rem] leading-relaxed text-faint">
        {isSignup
          ? "So your itineraries are still here next time."
          : "Sign in to reach your saved trips."}
      </p>

      {error && (
        <div
          role="alert"
          className="animate-fade mb-6 rounded-xl border border-[var(--color-signal-500)]/35
                     bg-[var(--color-signal-500)]/[0.07] px-4 py-3 text-[0.86rem]
                     text-foreground/90"
        >
          {error}
        </div>
      )}

      {/* Google first: it is the path most people take, and it avoids
          inventing yet another password. */}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => {
          setBusy("google");
          signIn("google", { callbackUrl: next });
        }}
        className="flex w-full items-center justify-center gap-3 rounded-xl border
                   border-input bg-surface px-4 py-3 text-[0.92rem] font-medium
                   transition-[background-color,transform] duration-200
                   hover:bg-foreground/[0.05] active:scale-[0.99]
                   disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy === "google" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <GoogleMark />
        )}
        Continue with Google
      </button>

      <div className="my-6 flex items-center gap-4">
        <span className="h-px flex-1 bg-hairline" />
        <span className="text-[0.72rem] uppercase tracking-[0.16em] text-faint">or</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {isSignup && (
          <label className="block">
            <span className="mb-2 block text-[0.84rem] font-medium">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              autoComplete="name"
              placeholder="Abbas Aamir"
              className={INPUT}
            />
          </label>
        )}

        <label className="block">
          <span className="mb-2 block text-[0.84rem] font-medium">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={255}
            autoComplete="email"
            placeholder="you@example.com"
            className={INPUT}
          />
        </label>

        <label className="block">
          <span className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-[0.84rem] font-medium">Password</span>
            {!isSignup && (
              <Link
                href="/forgot-password"
                className="text-[0.78rem] text-faint underline underline-offset-4
                           transition-colors hover:text-foreground"
              >
                Forgot password?
              </Link>
            )}
          </span>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={isSignup ? 8 : undefined}
              autoComplete={isSignup ? "new-password" : "current-password"}
              placeholder={isSignup ? "At least 8 characters" : "••••••••"}
              className={`${INPUT} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center
                         rounded-lg text-faint transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        {!isSignup && (
          <label className="flex cursor-pointer items-center gap-2.5 pt-1">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-signal-500)]"
            />
            <span className="text-[0.84rem] text-faint">Keep me signed in</span>
          </label>
        )}

        <button
          type="submit"
          disabled={busy !== null}
          className="flex w-full items-center justify-center gap-2 rounded-xl
                     bg-[var(--color-signal-500)] px-6 py-3.5 text-[0.94rem] font-semibold
                     text-white shadow-[0_10px_30px_-8px_rgba(228,87,46,0.55)]
                     transition-[background-color,transform] duration-200
                     hover:bg-[var(--color-signal-600)] active:scale-[0.99]
                     disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busy === "credentials" && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          )}
          {isSignup ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-7 text-center text-[0.88rem] text-faint">
        {isSignup ? "Already have an account?" : "No account yet?"}{" "}
        <Link
          href={isSignup ? "/signin" : "/signup"}
          className="font-medium text-foreground underline underline-offset-4
                     transition-colors hover:text-[var(--color-signal-500)]"
        >
          {isSignup ? "Sign in" : "Create one"}
        </Link>
      </p>

      <p className="mt-8 text-center text-[0.78rem] leading-relaxed text-faint/70">
        You do not need an account to plan a trip.{" "}
        <Link href="/plan" className="underline underline-offset-4 hover:text-foreground">
          Skip this
        </Link>
        .
      </p>
    </div>
  );
}

/** Google's mark, inlined so there is no external request on the auth page. */
function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
