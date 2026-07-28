"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bookmark, Check, Loader2 } from "lucide-react";
import type { Place } from "@/components/TripMap";

export interface TripInput {
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: number;
  currency: string;
  travelers: number;
  interests: string;
}

/**
 * Saves the finished itinerary.
 *
 * Only appears once generation has finished — offering it mid-stream would
 * store a half-written plan. Signed-out visitors get a sign-in link carrying
 * a callbackUrl rather than a disabled button, since "you can't do this" is
 * less useful than "here is how".
 */
export default function SaveTrip({
  input,
  markdown,
  places,
  disabled,
}: {
  input: TripInput;
  markdown: string;
  places: Place[];
  disabled?: boolean;
}) {
  const { status } = useSession();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  if (status === "loading") return null;

  if (status !== "authenticated") {
    return (
      <Link
        href="/signin?callbackUrl=/plan"
        className="inline-flex items-center gap-2 rounded-full border border-hairline
                   px-4 py-2 text-[0.84rem] font-medium transition-colors
                   hover:bg-foreground/[0.05]"
      >
        <Bookmark className="h-3.5 w-3.5" aria-hidden />
        Sign in to save
      </Link>
    );
  }

  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-[0.84rem] text-[var(--color-sage-500)]">
          <Check className="h-4 w-4" aria-hidden />
          Saved
        </span>
        {savedId && (
          <Link
            href={`/trips/${savedId}`}
            className="text-[0.82rem] underline underline-offset-4 text-faint
                       transition-colors hover:text-foreground"
          >
            View
          </Link>
        )}
      </span>
    );
  }

  async function save() {
    setState("saving");
    setError(null);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, markdown, places }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Could not save.");
        setState("idle");
        return;
      }

      setSavedId(data.id ?? null);
      setState("saved");
      // Refresh so the dashboard reflects the new trip without a hard reload.
      router.refresh();
    } catch {
      setError("Could not save. Check your connection.");
      setState("idle");
    }
  }

  return (
    <span className="inline-flex items-center gap-3">
      <button
        type="button"
        onClick={save}
        disabled={disabled || state === "saving"}
        className="inline-flex items-center gap-2 rounded-full border border-hairline
                   px-4 py-2 text-[0.84rem] font-medium transition-colors duration-200
                   hover:bg-foreground/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state === "saving" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Bookmark className="h-3.5 w-3.5" aria-hidden />
        )}
        Save trip
      </button>
      {error && (
        <span role="alert" className="text-[0.8rem] text-[var(--color-signal-500)]">
          {error}
        </span>
      )}
    </span>
  );
}
