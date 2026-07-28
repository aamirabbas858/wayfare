import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { dbConfigured } from "@/lib/db";
import { getTrip } from "@/lib/db/queries";
import { Nav, Footer } from "@/components/Chrome";
import SavedTrip from "@/components/SavedTrip";
import { formatAmount } from "@/lib/currency";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await auth();
  if (!session?.user?.id || !dbConfigured) return { title: "Trip" };
  const { id } = await params;
  const trip = await getTrip(session.user.id, id);
  return { title: trip ? `${trip.destination}` : "Trip" };
}

export default async function TripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  if (!session?.user?.id) redirect(`/signin?callbackUrl=/trips/${id}`);
  if (!dbConfigured) redirect("/plan");

  // getTrip filters on userId, so another account's trip is indistinguishable
  // from one that does not exist — both land here as a 404.
  const trip = await getTrip(session.user.id, id);
  if (!trip) notFound();

  const nights = Math.max(
    1,
    Math.round(
      (new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) /
        86_400_000
    )
  );

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  return (
    <div className="min-h-screen bg-background">
      <Nav cta={false} />

      <main id="main" className="mx-auto max-w-[104rem] px-5 py-8 sm:px-8">
        <Link
          href="/dashboard"
          className="mb-7 inline-flex items-center gap-1.5 rounded-full border border-hairline
                     px-4 py-2 text-[0.84rem] font-medium transition-colors
                     hover:bg-foreground/[0.05]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          My trips
        </Link>

        <header className="mb-9 border-b border-hairline pb-7">
          <p className="eyebrow mb-3">
            {fmt(trip.startDate)} — {fmt(trip.endDate)} · {nights}{" "}
            {nights === 1 ? "night" : "nights"}
          </p>
          <h1 className="display mb-3 text-[clamp(2rem,5.5vw,3.2rem)] font-semibold">
            {trip.destination}
          </h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.88rem] text-faint">
            <span>from {trip.origin}</span>
            <span className="tnum">
              {formatAmount(trip.budget, trip.currency)}
            </span>
            <span>
              {trip.travelers} {trip.travelers === 1 ? "traveller" : "travellers"}
            </span>
          </div>
        </header>

        <SavedTrip
          markdown={trip.markdown}
          places={trip.places}
          budget={trip.budget}
          currency={trip.currency}
        />
      </main>

      <Footer />
    </div>
  );
}
