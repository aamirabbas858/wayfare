import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/ResetForms";
import RouteCanvas from "@/components/RouteCanvas";

export const metadata: Metadata = { title: "Choose a new password" };

export default function Page() {
  return (
    <main
      id="main"
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-16"
    >
      <RouteCanvas />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0
                   bg-[radial-gradient(ellipse_at_50%_40%,transparent_10%,var(--background)_72%)]"
      />
      <div className="relative">
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
