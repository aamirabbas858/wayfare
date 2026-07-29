"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Search, Sparkles } from "lucide-react";
import { Nav, Footer } from "@/components/Chrome";
import TripMap, { DayLegend, type Place } from "@/components/TripMap";
import {
  ItinerarySection,
  SectionRail,
  parseSections,
  type Section,
} from "@/components/Itinerary";
import { useActiveSection } from "@/lib/hooks";
import { reconcileBudget } from "@/lib/budget";
import { splitMapData } from "@/lib/itinerary";
import SaveTrip from "@/components/SaveTrip";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  formatAmount,
  resolveCurrency,
  type CurrencyCode,
} from "@/lib/currency";

type Phase = "form" | "researching" | "writing" | "done" | "error";

const TODAY = new Date().toISOString().split("T")[0];

/* What the API is genuinely doing while the user waits — four parallel
   Tavily searches, then generation. These are labels for real work, not a
   fake progress bar. */
const RESEARCH_STEPS = [
  "Searching flights and routes",
  "Checking transit pass prices",
  "Comparing accommodation",
  "Pulling attraction fees",
];

export default function PlanPage() {
  const [phase, setPhase] = useState<Phase>("form");
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [step, setStep] = useState(0);

  // Live budget maths, mirroring the arithmetic the API does server-side.
  const [budget, setBudget] = useState("");
  const [travelers, setTravelers] = useState("1");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [submitted, setSubmitted] = useState<Record<string, string> | null>(null);

  const cur = resolveCurrency(currency);

  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => {
    if (!start || !end) return 0;
    const d = Math.ceil(
      (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000
    );
    return Number.isFinite(d) && d > 0 ? d : 0;
  }, [start, end]);

  const perDay = useMemo(() => {
    const b = parseInt(budget, 10);
    const t = Math.max(parseInt(travelers, 10) || 1, 1);
    if (!Number.isFinite(b) || b <= 0 || !days) return null;
    return Math.round(b / t / days);
  }, [budget, travelers, days]);

  /* Cycle research labels while waiting for the first token. */
  useEffect(() => {
    if (phase !== "researching") return;
    const id = setInterval(
      () => setStep((s) => (s + 1) % RESEARCH_STEPS.length),
      1600
    );
    return () => clearInterval(id);
  }, [phase]);

  /* The model appends a ```json block of map places at the very end. Split
     it off so it never renders as text, and parse it for the map. */
  const { sections, places } = useMemo(() => {
    if (!raw) return { sections: [] as Section[], places: [] as Place[] };

    const { prose, places: parsed } = splitMapData(raw);

    // Reconciled against the budget that was actually submitted, not the
    // live form state — editing a field after generating must not silently
    // rewrite the totals of the itinerary already on screen.
    const reconciled = reconcileBudget(
      prose,
      parseInt(submitted?.budget ?? "0", 10) || 0,
      submitted?.currency ?? DEFAULT_CURRENCY
    );

    return { sections: parseSections(reconciled), places: parsed };
  }, [raw, submitted]);

  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const active = useActiveSection(sectionIds);

  const submit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
      setSubmitted(data);

      setPhase("researching");
      setStep(0);
      setError(null);
      setRaw("");

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const res = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          signal: ac.signal,
        });

        if (!res.ok) {
          const text = await res.text();
          let msg = "Could not plan this trip.";
          try {
            msg = JSON.parse(text).error ?? msg;
          } catch {
            if (text) msg = text;
          }
          throw new Error(msg);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream.");

        const decoder = new TextDecoder();
        let acc = "";
        let first = true;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });

          // The route streams a 200 and reports failures inside the body, so a
          // provider error arrives as text rather than a bad status. Without
          // this the page would sit on skeletons forever, waiting for headings
          // that are never coming.
          const failure = acc.match(/\[Error:\s*([^\]]+)\]/);
          if (failure) {
            await reader.cancel().catch(() => {});
            setError(failure[1].trim());
            setPhase("error");
            return;
          }

          if (first && acc.trim()) {
            setPhase("writing");
            first = false;
          }
          setRaw(acc);
        }

        // A stream that closed without ever producing a heading is a failure
        // too, just a quieter one.
        if (!/^##\s+/m.test(acc)) {
          setError(
            "The planner returned an empty response. This usually clears on a retry."
          );
          setPhase("error");
          return;
        }

        setPhase("done");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setPhase("error");
      }
    },
    []
  );

  const reset = () => {
    abortRef.current?.abort();
    setPhase("form");
    setRaw("");
    setError(null);
    setActiveDay(null);
  };

  const busy = phase === "researching" || phase === "writing";
  const showResults = phase === "writing" || phase === "done";

  return (
    <div className="min-h-screen bg-background">
      <Nav cta={false} />

      <main id="main">
        {/* ── FORM ──────────────────────────────────────────────────── */}
        {phase === "form" && (
          <div className="mx-auto max-w-2xl px-5 py-14 sm:px-8 sm:py-20">
            <div data-stagger>
              <p className="eyebrow mb-4">New trip</p>
              <h1 className="display mb-3 text-[clamp(2.1rem,6vw,3.2rem)] font-semibold">
                Where are you going?
              </h1>
              <p className="mb-11 text-[0.98rem] leading-relaxed text-faint">
                The more specific you are about what you want, the less generic
                the itinerary. Takes about a minute to generate.
              </p>
            </div>

            <form onSubmit={submit} className="space-y-7" data-stagger>
              <Field label="Departing from" hint="City and country">
                <input
                  name="origin"
                  required
                  maxLength={80}
                  placeholder="Berlin, Germany"
                  autoComplete="off"
                  className={INPUT}
                />
              </Field>

              <Field label="Destination" hint="City and country">
                <input
                  name="destination"
                  required
                  maxLength={80}
                  placeholder="Lisbon, Portugal"
                  autoComplete="off"
                  className={INPUT}
                />
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Leaving">
                  <input
                    type="date"
                    name="startDate"
                    required
                    min={TODAY}
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className={INPUT}
                  />
                </Field>
                <Field
                  label="Returning"
                  hint={days ? `${days} ${days === 1 ? "day" : "days"}` : undefined}
                >
                  <input
                    type="date"
                    name="endDate"
                    required
                    min={start || TODAY}
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className={INPUT}
                  />
                </Field>
              </div>

              <div className="grid gap-5 sm:grid-cols-[1fr_auto_auto]">
                <Field label="Total budget" hint="For everyone, whole trip">
                  <div className="relative">
                    <span
                      className="tnum pointer-events-none absolute left-4 top-1/2
                                 -translate-y-1/2 text-faint"
                    >
                      {cur.symbol}
                    </span>
                    {/* step must be 1, not a round number: the browser validates
                        against min + (n × step), so min=1 with step=10 silently
                        rejects everything that is not 1, 11, 21… — which is how
                        a perfectly good 300000 became "Enter a valid value". */}
                    <input
                      type="number"
                      name="budget"
                      required
                      min={1}
                      step={1}
                      inputMode="numeric"
                      placeholder={cur.code === "EUR" ? "600" : "300000"}
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      className={`${INPUT} tnum`}
                      style={{ paddingLeft: `${2.2 + cur.symbol.length * 0.55}rem` }}
                    />
                  </div>
                </Field>

                <Field label="Currency">
                  <select
                    name="currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                    className={`${INPUT} cursor-pointer pr-9 appearance-none
                                bg-[length:0.7rem] bg-[right_0.9rem_center] bg-no-repeat`}
                    style={{
                      backgroundImage:
                        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
                    }}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} · {c.symbol}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Travellers">
                  <input
                    type="number"
                    name="travelers"
                    required
                    min={1}
                    max={20}
                    value={travelers}
                    onChange={(e) => setTravelers(e.target.value)}
                    className={`${INPUT} tnum w-24`}
                  />
                </Field>
              </div>

              {/* The API already computes this server-side and judges the
                  budget against it. Surfacing it live means you find out
                  before waiting a minute, not after. */}
              {perDay !== null && (
                <div className="animate-fade rounded-xl border border-hairline bg-surface/60 px-5 py-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[0.84rem] text-faint">
                      That is
                      <span className="tnum mx-1.5 text-[1.05rem] font-semibold text-foreground">
                        {formatAmount(perDay, currency)}
                      </span>
                      per person, per day
                    </span>
                    {/* The bands are calibrated in euros. Rather than invent
                        exchange rates that would drift out of date, the verdict
                        is only offered for EUR — the itinerary's own Reality
                        check does this properly using live local prices. */}
                    {currency === "EUR" ? (
                      <span
                        className={`text-[0.76rem] font-medium ${
                          perDay < 35
                            ? "text-[var(--color-signal-500)]"
                            : perDay < 70
                            ? "text-[var(--color-day-2)]"
                            : "text-[var(--color-sage-500)]"
                        }`}
                      >
                        {perDay < 35 ? "Very tight" : perDay < 70 ? "Workable" : "Comfortable"}
                      </span>
                    ) : (
                      <span className="text-[0.76rem] text-faint">
                        Verdict comes with the plan
                      </span>
                    )}
                  </div>
                </div>
              )}

              <Field
                label="What do you actually want to do?"
                hint="Be specific — this is what stops it being generic"
              >
                <textarea
                  name="interests"
                  required
                  rows={4}
                  maxLength={500}
                  placeholder="Cafés worth sitting in, electronic music, small museums over big ones, vegetarian food, walking neighbourhoods, no tourist traps"
                  className={`${INPUT} resize-y leading-relaxed`}
                />
              </Field>

              <button
                type="submit"
                className="group flex w-full items-center justify-center gap-2 rounded-full
                           bg-[var(--color-signal-500)] px-8 py-4 text-[0.95rem] font-semibold
                           text-white shadow-[0_10px_30px_-8px_rgba(228,87,46,0.6)]
                           transition-[transform,background-color] duration-200
                           hover:bg-[var(--color-signal-600)] active:scale-[0.99]"
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                Plan this trip
              </button>

              <p className="text-center text-[0.78rem] text-faint">
                No account, no card. Prices are researched live at the moment you ask.
              </p>
            </form>
          </div>
        )}

        {/* ── RESEARCHING ───────────────────────────────────────────── */}
        {phase === "researching" && (
          <div className="mx-auto flex min-h-[68vh] max-w-xl flex-col items-center justify-center px-6 text-center">
            <span className="relative mb-8 grid h-14 w-14 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-signal-500)]/20" />
              <Search className="h-6 w-6 text-[var(--color-signal-500)]" aria-hidden />
            </span>

            <h2 className="display mb-3 text-[1.7rem] font-semibold">
              Researching real prices
            </h2>

            <div aria-live="polite" className="mb-9 h-6">
              <p key={step} className="animate-fade text-[0.92rem] text-faint">
                {RESEARCH_STEPS[step]}…
              </p>
            </div>

            <ul className="w-full space-y-2 text-left">
              {RESEARCH_STEPS.map((s, i) => (
                <li
                  key={s}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 text-[0.84rem]
                              transition-colors duration-500 ${
                                i <= step
                                  ? "border-hairline text-foreground"
                                  : "border-transparent text-faint/50"
                              }`}
                >
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full ${
                      i < step
                        ? "bg-[var(--color-sage-500)]"
                        : i === step
                        ? "bg-[var(--color-signal-500)] animate-pulse-dot"
                        : "bg-current opacity-30"
                    }`}
                  />
                  {s}
                </li>
              ))}
            </ul>

            <button
              onClick={reset}
              className="mt-10 text-[0.82rem] text-faint underline underline-offset-4
                         transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── ERROR ─────────────────────────────────────────────────── */}
        {phase === "error" && (
          <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
            <h2 className="display mb-3 text-[1.7rem] font-semibold">
              That did not work
            </h2>
            <p className="mb-8 text-[0.92rem] leading-relaxed text-faint">{error}</p>
            <button
              onClick={reset}
              className="rounded-full bg-foreground px-7 py-3 text-[0.9rem] font-semibold
                         text-background transition-transform hover:scale-[1.03] active:scale-95"
            >
              Try again
            </button>
          </div>
        )}

        {/* ── RESULTS ───────────────────────────────────────────────── */}
        {showResults && (
          <div ref={resultRef} className="mx-auto max-w-[104rem] px-5 py-8 sm:px-8">
            <div className="mb-7 flex flex-wrap items-center gap-3">
              <button
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-full border border-hairline
                           px-4 py-2 text-[0.84rem] font-medium transition-colors
                           hover:bg-foreground/[0.05]"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                New trip
              </button>

              {phase === "writing" && (
                <span className="inline-flex items-center gap-2 text-[0.82rem] text-faint">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Writing your itinerary…
                </span>
              )}
              {phase === "done" && places.length > 0 && (
                <span className="tnum text-[0.82rem] text-faint">
                  {places.length} places mapped
                </span>
              )}

              {phase === "done" && submitted && sections.length > 0 && (
                <span className="ml-auto">
                  <SaveTrip
                    input={{
                      origin: submitted.origin ?? "",
                      destination: submitted.destination ?? "",
                      startDate: submitted.startDate ?? "",
                      endDate: submitted.endDate ?? "",
                      budget: parseInt(submitted.budget ?? "0", 10) || 0,
                      currency: submitted.currency ?? "EUR",
                      travelers: parseInt(submitted.travelers ?? "1", 10) || 1,
                      interests: submitted.interests ?? "",
                    }}
                    markdown={raw}
                    places={places}
                  />
                </span>
              )}
            </div>

            <div className="grid gap-10 xl:grid-cols-[190px_minmax(0,1fr)_400px]">
              {/* Contents rail — desktop only */}
              <aside className="hidden xl:block">
                <div className="sticky top-24">
                  <SectionRail sections={sections} active={active} />
                </div>
              </aside>

              {/* Itinerary */}
              <article className="min-w-0 space-y-12">
                {sections.length === 0 && (
                  <div className="space-y-3">
                    <div className="skeleton h-7 w-1/3" />
                    <div className="skeleton h-4 w-full" />
                    <div className="skeleton h-4 w-11/12" />
                    <div className="skeleton h-4 w-4/5" />
                  </div>
                )}
                {sections.map((s) => (
                  <ItinerarySection key={s.id} section={s} />
                ))}
              </article>

              {/* Map — sticky on desktop, inline first on mobile */}
              <aside className="order-first xl:order-none">
                <div className="sticky top-24 space-y-3">
                  {places.length > 0 ? (
                    <>
                      <TripMap
                        places={places}
                        activeDay={activeDay}
                        className="h-[300px] xl:h-[calc(100vh-13rem)]"
                      />
                      <DayLegend
                        places={places}
                        activeDay={activeDay}
                        onSelect={setActiveDay}
                      />
                    </>
                  ) : (
                    busy && (
                      <div className="skeleton h-[300px] xl:h-[calc(100vh-13rem)]" />
                    )
                  )}
                </div>
              </aside>
            </div>
          </div>
        )}
      </main>

      {phase === "form" && <Footer />}
    </div>
  );
}

/* ── Form primitives ────────────────────────────────────────────────── */

const INPUT =
  "w-full rounded-xl border border-input bg-surface px-4 py-3 text-[0.95rem] " +
  "text-foreground placeholder:text-faint/60 outline-none transition-[border-color,box-shadow] " +
  "duration-200 focus:border-[var(--color-signal-500)] " +
  "focus:shadow-[0_0_0_3px_rgba(228,87,46,0.14)]";

/**
 * Wrapping the control in the <label> gives implicit association, so the
 * accessible name is correct from first paint without generating ids or
 * reaching into the DOM.
 */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[0.86rem] font-medium">{label}</span>
        {hint && <span className="text-[0.76rem] font-normal text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
