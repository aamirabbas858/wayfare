"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Trash2, Users } from "lucide-react";
import { formatAmount } from "@/lib/currency";
import { dayColor } from "@/components/TripMap";
import type { TripSummary } from "@/lib/db/queries";

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function TripCard({
  trip,
  past = false,
}: {
  trip: TripSummary;
  past?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const nights = Math.max(
    1,
    Math.round(
      (new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) /
        86_400_000
    )
  );

  const days = Array.from(
    new Set(trip.places.map((p) => Math.max(1, Math.floor(p.day || 1))))
  ).sort((a, b) => a - b);

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/trips/${trip.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) start(() => router.refresh());
    else setConfirming(false);
  }

  return (
    <article
      className={`card-surface group relative flex flex-col p-5 transition-[transform,box-shadow]
                  duration-300 hover:-translate-y-1
                  hover:shadow-[0_18px_44px_-24px_rgba(0,0,0,0.5)]
                  ${past ? "opacity-75 hover:opacity-100" : ""}`}
    >
      <Link href={`/trips/${trip.id}`} className="flex-1">
        <p className="eyebrow mb-2.5">
          {fmt(trip.startDate)} – {fmt(trip.endDate)} · {nights}{" "}
          {nights === 1 ? "night" : "nights"}
        </p>

        <h3 className="display mb-1 text-[1.3rem] font-semibold leading-tight">
          {trip.destination}
        </h3>
        <p className="mb-4 text-[0.82rem] text-faint">from {trip.origin}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.8rem] text-faint">
          <span className="tnum">{formatAmount(trip.budget, trip.currency)}</span>
          {trip.travelers > 1 && (
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" aria-hidden />
              {trip.travelers}
            </span>
          )}
          {trip.places.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {trip.places.length}
            </span>
          )}
        </div>

        {/* The day palette doubles as a glance at how long the plan runs. */}
        {days.length > 0 && (
          <div className="mt-4 flex gap-1" aria-hidden>
            {days.slice(0, 8).map((d) => (
              <span
                key={d}
                className="h-1 flex-1 rounded-full"
                style={{ background: dayColor(d) }}
              />
            ))}
          </div>
        )}
      </Link>

      {/* Delete is deliberately two-step. These take a minute to generate and
          there is no undo. */}
      <div className="mt-4 flex items-center justify-end border-t border-hairline pt-3">
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-[0.78rem] text-faint">Delete this trip?</span>
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-full px-3 py-1 text-[0.78rem] text-faint
                         transition-colors hover:text-foreground"
            >
              Keep
            </button>
            <button
              onClick={remove}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full
                         bg-[var(--color-signal-500)] px-3 py-1 text-[0.78rem]
                         font-medium text-white transition-colors
                         hover:bg-[var(--color-signal-600)] disabled:opacity-60"
            >
              {(busy || pending) && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
              Delete
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            aria-label={`Delete trip to ${trip.destination}`}
            className="grid h-8 w-8 place-items-center rounded-lg text-faint
                       opacity-0 transition-[opacity,color] duration-200
                       hover:text-[var(--color-signal-500)] focus-visible:opacity-100
                       group-hover:opacity-100"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </article>
  );
}
