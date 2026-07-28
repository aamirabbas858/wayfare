import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { trips, users, type NewTrip, type StoredPlace } from "@/lib/db/schema";

/* ────────────────────────────────────────────────────────────────────────
   Every function here takes userId and filters on it. Ownership is enforced
   in the WHERE clause rather than checked afterwards in a route handler,
   because a forgotten check is then a missing argument the compiler catches
   rather than a silent data leak between accounts.

   `server-only` makes importing this from a client component a build error.
   ──────────────────────────────────────────────────────────────────────── */

/** Columns safe to return. passwordHash is never among them. */
const tripColumns = {
  id: trips.id,
  origin: trips.origin,
  destination: trips.destination,
  startDate: trips.startDate,
  endDate: trips.endDate,
  budget: trips.budget,
  currency: trips.currency,
  travelers: trips.travelers,
  interests: trips.interests,
  places: trips.places,
  createdAt: trips.createdAt,
};

export type TripSummary = {
  id: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: number;
  currency: string;
  travelers: number;
  interests: string;
  places: StoredPlace[];
  createdAt: Date;
};

/** Trip list for the dashboard. Markdown is excluded — it is the largest
 *  column by far and no list view renders it. */
export async function listTrips(userId: string): Promise<TripSummary[]> {
  return db
    .select(tripColumns)
    .from(trips)
    .where(eq(trips.userId, userId))
    .orderBy(desc(trips.createdAt));
}

/** A single trip including its itinerary. Returns undefined when the id does
 *  not exist *or* belongs to someone else — the caller cannot tell the
 *  difference, which is the point. */
export async function getTrip(userId: string, tripId: string) {
  const [row] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
    .limit(1);
  return row;
}

export async function createTrip(trip: NewTrip) {
  const [row] = await db.insert(trips).values(trip).returning({ id: trips.id });
  return row;
}

/** Returns whether a row was actually removed, so the caller can answer 404
 *  rather than pretending a delete succeeded against someone else's trip. */
export async function deleteTrip(userId: string, tripId: string) {
  const deleted = await db
    .delete(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
    .returning({ id: trips.id });
  return deleted.length > 0;
}

/**
 * Dashboard figures, computed in one round trip.
 *
 * Upcoming and past are split on endDate rather than startDate: a trip you
 * are in the middle of is not "past", and counting it as such would be the
 * kind of small wrongness that undermines the whole panel.
 */
export async function tripStats(userId: string) {
  const today = new Date().toISOString().slice(0, 10);

  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      upcoming: sql<number>`count(*) filter (where ${trips.endDate} >= ${today})::int`,
      past: sql<number>`count(*) filter (where ${trips.endDate} < ${today})::int`,
      destinations: sql<number>`count(distinct lower(${trips.destination}))::int`,
      nextDeparture: sql<string | null>`min(${trips.startDate}) filter (where ${trips.startDate} >= ${today})`,
    })
    .from(trips)
    .where(eq(trips.userId, userId));

  return (
    row ?? {
      total: 0,
      upcoming: 0,
      past: 0,
      destinations: 0,
      nextDeparture: null,
    }
  );
}

/* ── Users ──────────────────────────────────────────────────────────── */

export async function findUserByEmail(email: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return row;
}

export async function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
}) {
  const [row] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
    })
    .returning({ id: users.id, email: users.email, name: users.name });
  return row;
}

export async function setPassword(userId: string, passwordHash: string) {
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}
