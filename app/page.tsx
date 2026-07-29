"use client";

import Link from "next/link";
import { Nav, Footer } from "@/components/Chrome";
import RouteCanvas from "@/components/RouteCanvas";
import { useReveal } from "@/lib/hooks";

/* ────────────────────────────────────────────────────────────────────────
   Every sample below is the shape of real output from /api/plan. The
   landing page argues by demonstration: rather than claiming "honest
   advice", it shows the sentences the product actually writes.
   ──────────────────────────────────────────────────────────────────────── */

const SAMPLES = [
  {
    kind: "Reality check",
    tone: "signal" as const,
    body: "€63/day per person. Cheapest viable day in Lisbon: hostel €22/night + market lunch €9/day + Navegante pass €6.80/day = €37.80/day minimum.",
    note: "Your budget covers this comfortably.",
  },
  {
    kind: "Skip this",
    tone: "warn" as const,
    body: "Pink Street after 22:00. It is four bars of overpriced sangria and a queue. Walk five minutes to Cais do Sodré instead.",
    note: null,
  },
  {
    kind: "Local rule",
    tone: "sage" as const,
    body: "Validate the Navegante at the yellow reader, not the turnstile. Inspectors board mid-line and the fine is €120 regardless of whether you meant to.",
    note: null,
  },
];

const STEPS = [
  {
    n: "01",
    title: "Tell it the constraints",
    body: "Where from, where to, the dates, the total budget, and what you actually want to do. No account, no onboarding.",
  },
  {
    n: "02",
    title: "It researches live prices",
    body: "Four parallel searches — flights, transit passes, accommodation, attraction fees — so the numbers come from this month, not the model's memory.",
  },
  {
    n: "03",
    title: "You get an itinerary that argues",
    body: "Day by day, with named places, real fees, transit stops, and an honest verdict on whether the budget works. Every place lands on the map.",
  },
];

export default function Home() {
  const [proofRef, proofVisible] = useReveal<HTMLDivElement>();
  const [howRef, howVisible] = useReveal<HTMLDivElement>();
  const [closeRef, closeVisible] = useReveal<HTMLDivElement>();

  return (
    <div className="min-h-screen bg-background">
      <Nav />

      <main id="main">
        {/* ── HERO ──────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <RouteCanvas />
          {/* Fades the canvas out toward the content so the type never
              competes with a moving background. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0
                       bg-[radial-gradient(ellipse_at_50%_0%,transparent_25%,var(--background)_78%)]"
          />

          <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-20 sm:px-8 sm:pb-32 sm:pt-28">
            <div data-stagger className="max-w-4xl">
              <p className="eyebrow mb-7 flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-signal-500)] animate-pulse-dot"
                />
                Live pricing · No account needed
              </p>

              <h1 className="display text-[clamp(3rem,10vw,7.5rem)] font-semibold">
                Travel planning,
                <br />
                made{" "}
                <span className="relative inline-block">
                  honest
                  <svg
                    aria-hidden
                    viewBox="0 0 300 14"
                    preserveAspectRatio="none"
                    className="absolute -bottom-1 left-0 h-[0.14em] w-full text-[var(--color-signal-500)]"
                  >
                    <path
                      d="M2 9C60 3 130 2 298 6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                .
              </h1>

              <p className="prose-measure mt-9 text-[1.05rem] leading-relaxed text-faint sm:text-[1.18rem]">
                Most trip planners write brochure copy. This one researches what
                a place costs this month, names the hostel, tells you which
                attraction is a tourist trap, and does the arithmetic on whether
                your budget actually works.
              </p>

              <div className="mt-11 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/plan"
                  className="group inline-flex h-13 items-center justify-center gap-2 rounded-full
                             bg-[var(--color-signal-500)] px-8 py-3.5 text-[0.95rem] font-semibold
                             text-white shadow-[0_10px_30px_-8px_rgba(228,87,46,0.6)]
                             transition-[transform,box-shadow,background-color] duration-200
                             hover:bg-[var(--color-signal-600)]
                             hover:shadow-[0_14px_38px_-8px_rgba(228,87,46,0.7)]
                             active:scale-[0.98]"
                >
                  Plan a trip
                  <span
                    aria-hidden
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  >
                    →
                  </span>
                </Link>
                <a
                  href="#how"
                  className="inline-flex h-13 items-center justify-center rounded-full border
                             border-hairline px-7 py-3.5 text-[0.95rem] font-medium
                             transition-colors duration-200 hover:bg-foreground/[0.05]"
                >
                  How it works
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── PROOF: what the output actually reads like ─────────────── */}
        <section
          ref={proofRef}
          data-visible={proofVisible}
          className="reveal border-y border-hairline bg-surface/40"
        >
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
              <h2 className="display max-w-xl text-[clamp(1.8rem,4vw,2.7rem)] font-semibold">
                This is what it writes.
              </h2>
              <p className="text-sm text-faint">Sample output · Lisbon, 5 days, €450</p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {SAMPLES.map((s, i) => (
                <article
                  key={s.kind}
                  style={{ transitionDelay: `${i * 90}ms` }}
                  className="reveal card-surface group relative flex flex-col overflow-hidden p-6
                             transition-[transform,box-shadow,border-color] duration-300
                             hover:-translate-y-1 hover:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.45)]"
                  data-visible={proofVisible}
                >
                  <span
                    aria-hidden
                    className={`absolute inset-x-0 top-0 h-[3px] ${
                      s.tone === "signal"
                        ? "bg-[var(--color-signal-500)]"
                        : s.tone === "warn"
                        ? "bg-[var(--color-day-2)]"
                        : "bg-[var(--color-sage-500)]"
                    }`}
                  />
                  <p className="eyebrow mb-4">{s.kind}</p>
                  <p className="text-[0.94rem] leading-relaxed text-foreground/85">
                    {s.body}
                  </p>
                  {s.note && (
                    <p className="tnum mt-4 border-t border-hairline pt-4 text-[0.8rem] text-[var(--color-sage-500)]">
                      {s.note}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── HOW ───────────────────────────────────────────────────── */}
        <section id="how" ref={howRef} data-visible={howVisible} className="reveal">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <p className="eyebrow mb-4">How it works</p>
            <h2 className="display mb-14 max-w-2xl text-[clamp(1.9rem,4.4vw,3rem)] font-semibold">
              Three inputs. About a minute. One itinerary you can actually follow.
            </h2>

            <ol className="grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="group bg-background p-7 transition-colors duration-300 hover:bg-surface">
                  <span className="tnum mb-5 block text-[0.75rem] text-[var(--color-signal-500)]">
                    {s.n}
                  </span>
                  <h3 className="mb-2.5 text-[1.02rem] font-semibold">{s.title}</h3>
                  <p className="text-[0.9rem] leading-relaxed text-faint">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── CLOSE ─────────────────────────────────────────────────── */}
        <section
          ref={closeRef}
          data-visible={closeVisible}
          className="reveal relative overflow-hidden border-t border-hairline"
        >
          <div className="map-grid absolute inset-0" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-5 py-24 text-center sm:px-8 sm:py-32">
            <h2 className="display mx-auto max-w-2xl text-[clamp(2rem,5.5vw,3.6rem)] font-semibold">
              Where are you going?
            </h2>
            <p className="mx-auto mt-5 max-w-md text-[0.98rem] text-faint">
              Free, no signup, and it will tell you if your budget does not work.
            </p>
            <Link
              href="/plan"
              className="group mt-10 inline-flex items-center gap-2 rounded-full bg-foreground
                         px-9 py-4 text-[0.95rem] font-semibold text-background
                         transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]"
            >
              Start planning
              <span
                aria-hidden
                className="transition-transform duration-200 group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
