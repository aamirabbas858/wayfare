"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/hooks";
import UserMenu from "@/components/UserMenu";

/** The wordmark, used in the nav and the footer. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`display text-[1.35rem] font-semibold tracking-tight ${className}`}>
      wayfare
      <span className="text-[var(--color-signal-500)]">.</span>
    </span>
  );
}

export function ThemeToggle() {
  const { dark, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);
  // The server cannot know which theme the browser applied, so the toggle
  // renders inert until it does. Setting state on mount is the point, not an
  // accident — this is what makes the first paint match what the no-flash
  // script already put on screen.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={dark}
      className="grid h-9 w-9 place-items-center rounded-full border border-hairline
                 text-foreground/70 transition-[color,background-color,transform]
                 duration-200 hover:bg-foreground/[0.06] hover:text-foreground
                 active:scale-95"
    >
      {/* Render nothing until mounted so the icon can't disagree with the
          theme the no-flash script already applied. */}
      {mounted ? (
        dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
      ) : (
        <span className="h-4 w-4" />
      )}
    </button>
  );
}

/**
 * Top navigation. Becomes a floating glass bar once scrolled, so the hero
 * stays uninterrupted at rest but the nav remains reachable.
 */
export function Nav({ cta = true }: { cta?: boolean }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter]
                  duration-300 ${
                    scrolled
                      ? "glass border-b"
                      : "border-b border-transparent bg-transparent"
                  }`}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5 sm:px-8"
      >
        <Link
          href="/"
          className="rounded-md transition-opacity hover:opacity-70"
          aria-label="Wayfare home"
        >
          <Wordmark />
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <UserMenu />
          {cta && (
            <Link
              href="/plan"
              className="group inline-flex h-9 items-center gap-1.5 rounded-full
                         bg-foreground px-4 text-[0.82rem] font-semibold text-background
                         transition-transform duration-200 hover:scale-[1.03] active:scale-95"
            >
              Plan a trip
              <span
                aria-hidden
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-hairline px-5 py-10 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center">
        <Wordmark className="opacity-50" />
        <p className="text-[0.78rem] text-faint sm:ml-auto">
          Prices are researched live and can move. Verify before you book.
        </p>
        <p className="text-[0.78rem] text-faint">
          Built by{" "}
          <a
            href="https://github.com/aamirabbas858"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-hairline underline-offset-4 transition-colors hover:text-foreground"
          >
            Abbas Aamir
          </a>
        </p>
      </div>
    </footer>
  );
}
