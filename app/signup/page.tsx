import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import RouteCanvas from "@/components/RouteCanvas";
import { auth } from "@/lib/auth";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage() {
  // Already signed in: send them where they were going rather than showing a
  // form that would immediately bounce them anyway.
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main id="main" className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-16">
      <RouteCanvas />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0
                   bg-[radial-gradient(ellipse_at_50%_40%,transparent_10%,var(--background)_72%)]"
      />
      <div className="relative">
        <Suspense fallback={null}>
          <AuthForm mode="signup" />
        </Suspense>
      </div>
    </main>
  );
}
