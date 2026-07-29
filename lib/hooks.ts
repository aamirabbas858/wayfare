"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reveals an element once as it scrolls into view.
 *
 * Uses IntersectionObserver rather than a scroll listener so the work happens
 * off the main thread, and unobserves after firing so nothing re-animates on
 * the way back up. Pair with the `.reveal` class in globals.css.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options: { threshold?: number; rootMargin?: string } = {}
) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Anyone who has asked for reduced motion gets the end state immediately.
    // matchMedia does not exist during server rendering, so this cannot be
    // decided any earlier than here.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.unobserve(entry.target);
        }
      },
      {
        threshold: options.threshold ?? 0.15,
        rootMargin: options.rootMargin ?? "0px 0px -8% 0px",
      }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [options.threshold, options.rootMargin]);

  // Returned as a tuple rather than an object. `ref={r.ref}` reads a
  // property during render, which the React Compiler flags; destructuring at
  // the call site hands the ref over directly and says the same thing.
  return [ref, visible] as const;
}

/**
 * Theme state, kept in sync with the class the no-flash script in layout.tsx
 * already applied. Reads the DOM rather than defaulting, so the first render
 * matches what the user is actually looking at.
 */
export function useTheme() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    // Reads the class the no-flash script in layout.tsx already applied,
    // rather than defaulting and then correcting. The DOM is the source of
    // truth here and it is only readable after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      document.documentElement.style.colorScheme = next ? "dark" : "light";
      try {
        localStorage.setItem("wayfare-theme", next ? "dark" : "light");
      } catch {
        /* private browsing — the class still applied, it just won't persist */
      }
      return next;
    });
  }, []);

  return { dark, toggle };
}

/**
 * Tracks which section is currently in view, for the itinerary's day rail.
 * Picks the entry closest to the top of the viewport rather than the first
 * intersecting one, so fast scrolling doesn't leave the rail lagging behind.
 */
export function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    if (!ids.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        const inView = entries.filter((e) => e.isIntersecting);
        if (!inView.length) return;
        const top = inView.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b
        );
        setActive(top.target.id);
      },
      { rootMargin: "-12% 0px -70% 0px", threshold: [0, 0.25, 0.5] }
    );

    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    els.forEach((el) => io.observe(el));

    return () => io.disconnect();
  }, [ids]);

  return active;
}

/** Debounced value, used to keep the live budget maths off every keystroke. */
export function useDebounced<T>(value: T, delay = 220): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
