import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, MapPin, Plus, Wallet } from "lucide-react";

import { auth } from "@/lib/auth";
import { dbConfigured } from "@/lib/db";
import { listTrips, tripStats } from "@/lib/db/queries";
import { Nav, Footer } from "@/components/Chrome";
import TripCard from "@/components/TripCard";
import { formatAmount } from "@/lib/currency";

export const metadata: Metadata = { title: "My trips" };
export const dynamic = "force-dynamic";

/* Every figure on this page is computed from saved trips. Nothing here is a
   placeholder waiting for a data source — a tile with invented numbers is
   worse than no tile. */

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?callbackUrl=/dashboard");
  if (!dbConfigured) redirect("/plan");

  const userId = session.user.id;
  const [trips, stats] = await Promise.all([listTrips(userId), tripStats(userId)]);

  const firstName = (session.user.name ?? "").split(" ")[0];

  // Total planned spend, normalised per currency rather than summed blindly —
  // adding PKR to EUR would produce a number that means nothing.
  const spendByCurrency = trips.reduce<Record<string, number>>((acc, t) => {
    acc[t.currency] = (acc[t.currency] ?? 0) + t.budget;
    return acc;
  }, {});
  const [topCurrency, topSpend] =
    Object.entries(spendByCurrency).sort((a, b) => b[1] - a[1])[0] ?? [];

  const daysToNext = stats.nextDeparture
    ? Math.ceil(
        (new Date(stats.nextDeparture).getTime() - Date.now()) / 86_400_000
      )
    : null;

  const upcoming = trips.filter((t) => t.endDate >= new Date().toISOString().slice(0, 10));
  const past = trips.filter((t) => t.endDate < new Date().toISOString().slice(0, 10));

  return (
    <div className="min-h-screen bg-background">
      <Nav cta={false} />

      <main id="main" className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow mb-3">Your trips</p>
            <h1 className="display text-[clamp(2rem,5.5vw,3rem)] font-semibold">
              {firstName ? `Hello, ${firstName}` : "Hello"}
            </h1>
          </div>

          <Link
            href="/plan"
            className="group inline-flex items-center gap-2 rounded-full
                       bg-[var(--color-signal-500)] px-6 py-3 text-[0.9rem] font-semibold
                       text-white shadow-[0_10px_28px_-10px_rgba(228,87,46,0.6)]
                       transition-[background-color,transform] duration-200
                       hover:bg-[var(--color-signal-600)] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Plan a trip
          </Link>
        </div>

        {trips.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <section
              aria-label="Summary"
              className="mb-12 grid gap-px overflow-hidden rounded-xl border border-hairline
                         bg-hairline sm:grid-cols-2 lg:grid-cols-4"
            >
              <Stat
                icon={<CalendarDays className="h-4 w-4" />}
                label="Trips planned"
                value={String(stats.total)}
                sub={`${stats.upcoming} upcoming · ${stats.past} past`}
              />
              <Stat
                icon={<MapPin className="h-4 w-4" />}
                label="Destinations"
                value={String(stats.destinations)}
                sub={stats.destinations === 1 ? "city" : "different cities"}
              />
              <Stat
                icon={<Wallet className="h-4 w-4" />}
                label="Planned spend"
                value={topCurrency ? formatAmount(topSpend, topCurrency) : "—"}
                sub={
                  Object.keys(spendByCurrency).length > 1
                    ? `in ${topCurrency}, plus other currencies`
                    : "across all trips"
                }
              />
              <Stat
                icon={<CalendarDays className="h-4 w-4" />}
                label="Next departure"
                value={daysToNext === null ? "—" : daysToNext <= 0 ? "Now" : String(daysToNext)}
                sub={
                  daysToNext === null
                    ? "nothing booked"
                    : daysToNext <= 0
                    ? "you are travelling"
                    : daysToNext === 1
                    ? "day away"
                    : "days away"
                }
              />
            </section>

            {upcoming.length > 0 && (
              <section className="mb-12">
                <h2 className="display mb-5 text-[1.4rem] font-semibold">
                  Upcoming
                </h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {upcoming.map((t) => (
                    <TripCard key={t.id} trip={t} />
                  ))}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <section>
                <h2 className="display mb-5 text-[1.4rem] font-semibold">Past</h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {past.map((t) => (
                    <TripCard key={t.id} trip={t} past />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-background p-6">
      <div className="mb-4 flex items-center gap-2 text-faint">
        {icon}
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em]">
          {label}
        </span>
      </div>
      <p className="tnum mb-1 text-[2rem] font-semibold leading-none">{value}</p>
      <p className="text-[0.78rem] text-faint">{sub}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-hairline px-6 py-20 text-center">
      <p className="display mb-3 text-[1.6rem] font-semibold">No saved trips yet</p>
      <p className="mx-auto mb-8 max-w-sm text-[0.92rem] leading-relaxed text-faint">
        Plan one and hit save, and it will be waiting here — itinerary, map and
        all — next time you sign in.
      </p>
      <Link
        href="/plan"
        className="inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-3
                   text-[0.9rem] font-semibold text-background transition-transform
                   duration-200 hover:scale-[1.03] active:scale-[0.98]"
      >
        Plan your first trip
      </Link>
    </div>
  );
}
