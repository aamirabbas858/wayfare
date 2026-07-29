import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { db, dbConfigured } from "@/lib/db";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";

export const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email address.").max(255),
  // 8 is the floor rather than a wall of complexity rules: length beats
  // character-class requirements, which mostly push people toward "Passw0rd!".
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(200),
});

export const signUpSchema = credentialsSchema.extend({
  name: z.string().trim().min(1, "Please enter your name.").max(80),
});

/** Cost 12 — noticeably slower than the default 10, still a few hundred ms. */
export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);

export const { handlers, auth, signIn, signOut } = NextAuth({
  // The adapter persists users and linked OAuth accounts. It is omitted when
  // no database is configured so the site still builds and runs — sign-in is
  // simply unavailable, rather than the whole app failing.
  adapter: dbConfigured
    ? DrizzleAdapter(db, {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions,
        verificationTokensTable: verificationTokens,
      })
    : undefined,

  // JWT rather than database sessions: the Credentials provider cannot use
  // database sessions in Auth.js, and mixing strategies per provider is not
  // supported. This keeps both sign-in paths on one mechanism.
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },

  pages: {
    signIn: "/signin",
    error: "/signin",
  },

  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Lets a Google sign-in attach to an existing email/password account
      // rather than failing with OAuthAccountNotLinked. Safe here because
      // Google verifies the address before asserting it.
      allowDangerousEmailAccountLinking: true,
    }),

    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        if (!dbConfigured) return null;

        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .limit(1);

        // Compare against a dummy hash when the account is missing or is
        // OAuth-only, so the response time does not reveal which emails are
        // registered. Returning early here would make that measurable.
        const hash =
          user?.passwordHash ??
          "$2a$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012";

        const ok = await bcrypt.compare(password, hash);
        if (!ok || !user?.passwordHash) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      // Only present on the sign-in pass; afterwards the id is already there.
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },

  // Vercel serves every deployment on two hosts: the production alias
  // (wayfare-xi.vercel.app) and a per-deploy URL like
  // wayfare-n4j18w3f7-....vercel.app. trustHost means Auth.js builds the OAuth
  // callback from whichever Host header arrived — so signing in worked on the
  // alias and failed with redirect_uri_mismatch on the deploy URL, because
  // only the alias is registered with Google. Google does not accept wildcard
  // redirect URIs, and a new deploy URL is generated on every push, so
  // registering them is not an option.
  //
  // AUTH_URL pins the callback to one canonical origin regardless of how the
  // request arrived. It must be set in production; without it this bug returns
  // silently the moment anyone opens a deployment URL rather than the alias.
  trustHost: true,
});
