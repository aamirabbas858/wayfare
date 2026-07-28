import {
  pgTable,
  text,
  timestamp,
  integer,
  primaryKey,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

/* ────────────────────────────────────────────────────────────────────────
   AUTH TABLES

   Shapes required by @auth/drizzle-adapter. Renaming columns here breaks
   the adapter, so the only addition is `passwordHash` — Auth.js has no
   opinion about credentials storage, and it is nullable because a user who
   signed in with Google has no password and never will.
   ──────────────────────────────────────────────────────────────────────── */

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // Null for OAuth-only accounts. Never selected into anything that reaches
  // the client — see lib/db/queries.ts, which always projects explicit columns.
  passwordHash: text("passwordHash"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

/**
 * Single-use tokens for password reset. Kept separate from
 * verificationTokens so expiring or invalidating one flow cannot affect the
 * other, and so a used token can be marked rather than deleted — which makes
 * "this link has already been used" distinguishable from "this link is
 * nonsense".
 */
export const passwordResetTokens = pgTable(
  "passwordResetToken",
  {
    token: text("token").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date" }).notNull(),
    usedAt: timestamp("usedAt", { mode: "date" }),
  },
  (t) => [index("prt_user_idx").on(t.userId)]
);

/* ────────────────────────────────────────────────────────────────────────
   TRIPS
   ──────────────────────────────────────────────────────────────────────── */

/** A place as emitted in the itinerary's map block. */
export interface StoredPlace {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  day: number;
  type?: string;
}

export const trips = pgTable(
  "trip",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // The inputs, kept so a trip can be regenerated or duplicated later.
    origin: text("origin").notNull(),
    destination: text("destination").notNull(),
    startDate: text("startDate").notNull(), // ISO date, no timezone semantics
    endDate: text("endDate").notNull(),
    budget: integer("budget").notNull(),
    currency: text("currency").notNull().default("EUR"),
    travelers: integer("travelers").notNull().default(1),
    interests: text("interests").notNull(),

    // The output. Markdown is stored verbatim rather than parsed, so a change
    // to how sections are rendered never invalidates saved trips.
    markdown: text("markdown").notNull(),
    places: jsonb("places").$type<StoredPlace[]>().notNull().default([]),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    // The dashboard's two main reads are "this user's trips, newest first"
    // and "this user's trips by start date" for upcoming vs past.
    index("trip_user_created_idx").on(t.userId, t.createdAt),
    index("trip_user_start_idx").on(t.userId, t.startDate),
  ]
);

export type User = typeof users.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type NewTrip = typeof trips.$inferInsert;
