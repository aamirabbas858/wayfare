"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { LayoutGrid, LogOut } from "lucide-react";

/**
 * Signed-out: a sign-in link. Signed-in: an avatar that opens a small menu.
 *
 * Renders a fixed-size placeholder while the session is loading so the nav
 * does not jump once it resolves.
 */
export default function UserMenu() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (status === "loading") {
    return <div className="h-9 w-9 rounded-full bg-foreground/[0.06]" aria-hidden />;
  }

  if (!session?.user) {
    return (
      <Link
        href="/signin"
        className="inline-flex h-9 items-center rounded-full border border-hairline px-4
                   text-[0.82rem] font-medium transition-colors duration-200
                   hover:bg-foreground/[0.05]"
      >
        Sign in
      </Link>
    );
  }

  const { name, email, image } = session.user;
  const initial = (name ?? email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border
                   border-hairline bg-surface text-[0.82rem] font-semibold
                   transition-transform duration-200 hover:scale-105 active:scale-95"
      >
        {image ? (
          // Plain <img>: the source is an arbitrary Google CDN host, and
          // next/image would need every possible remote host allow-listed.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="animate-rise absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-xl
                     border border-hairline bg-surface-raised shadow-[0_18px_44px_-16px_rgba(0,0,0,0.5)]"
        >
          <div className="border-b border-hairline px-4 py-3">
            <p className="truncate text-[0.86rem] font-medium">{name ?? "Traveller"}</p>
            <p className="truncate text-[0.76rem] text-faint">{email}</p>
          </div>

          <Link
            href="/dashboard"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-[0.86rem]
                       transition-colors hover:bg-foreground/[0.05]"
          >
            <LayoutGrid className="h-4 w-4 text-faint" aria-hidden />
            My trips
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex w-full items-center gap-2.5 border-t border-hairline px-4 py-2.5
                       text-left text-[0.86rem] transition-colors hover:bg-foreground/[0.05]"
          >
            <LogOut className="h-4 w-4 text-faint" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
