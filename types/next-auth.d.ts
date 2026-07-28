import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  /** `id` is attached in the session callback; without this augmentation
   *  every `session.user.id` read would be a type error. */
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
