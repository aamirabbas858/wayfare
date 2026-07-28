"use client";

import { SessionProvider } from "next-auth/react";

/** Auth.js needs a client boundary for useSession(); the rest of the tree
 *  stays as server components. */
export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
