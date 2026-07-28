"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  BadgeEuro,
  BedDouble,
  CalendarDays,
  CircleCheck,
  Compass,
  Info,
  MapPin,
  Plane,
  ShieldAlert,
  Train,
  UtensilsCrossed,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────
   The model returns markdown with a known set of `## ` headings. Rather
   than rendering one undifferentiated wall of prose, each section is
   matched to a treatment: the budget verdict becomes a card you cannot
   miss, warnings read as warnings, and costs are set in tabular figures.

   Matching is on a lowercased substring so a small wording drift in the
   prompt degrades to the default treatment instead of breaking the page.
   ──────────────────────────────────────────────────────────────────────── */

type Tone = "verdict" | "warn" | "info" | "plain";

interface SectionMeta {
  icon: LucideIcon;
  tone: Tone;
}

const SECTION_META: { match: string; meta: SectionMeta }[] = [
  { match: "essential",   meta: { icon: Compass,           tone: "info" } },
  { match: "reality",     meta: { icon: BadgeEuro,         tone: "verdict" } },
  { match: "book today",  meta: { icon: CircleCheck,       tone: "warn" } },
  { match: "budget",      meta: { icon: BadgeEuro,         tone: "plain" } },
  { match: "getting there", meta: { icon: Plane,           tone: "plain" } },
  { match: "where to stay", meta: { icon: BedDouble,       tone: "plain" } },
  { match: "transit",     meta: { icon: Train,             tone: "plain" } },
  { match: "day-by-day",  meta: { icon: CalendarDays,      tone: "plain" } },
  { match: "trap",        meta: { icon: AlertTriangle,     tone: "warn" } },
  { match: "food",        meta: { icon: UtensilsCrossed,   tone: "plain" } },
  { match: "safety",      meta: { icon: ShieldAlert,       tone: "warn" } },
  { match: "quirk",       meta: { icon: Info,              tone: "info" } },
  { match: "practical",   meta: { icon: Info,              tone: "plain" } },
  { match: "verify",      meta: { icon: ShieldAlert,       tone: "warn" } },
];

function metaFor(title: string): SectionMeta {
  const t = title.toLowerCase();
  return (
    SECTION_META.find((s) => t.includes(s.match))?.meta ?? {
      icon: MapPin,
      tone: "plain",
    }
  );
}

export interface Section {
  id: string;
  title: string;
  body: string;
  meta: SectionMeta;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Splits the streamed markdown into `## ` sections, preserving order. */
export function parseSections(markdown: string): Section[] {
  if (!markdown.trim()) return [];

  const parts = markdown.split(/^##\s+/m).filter((p) => p.trim());
  const out: Section[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const nl = part.indexOf("\n");
    const rawTitle = (nl === -1 ? part : part.slice(0, nl)).trim();
    const body = nl === -1 ? "" : part.slice(nl + 1).trim();
    if (!rawTitle) continue;

    // Anything before the first heading is preamble, not a section.
    if (!out.length && !/^[A-Z]/.test(rawTitle)) continue;

    let id = slugify(rawTitle) || `section-${out.length}`;
    while (seen.has(id)) id = `${id}-${out.length}`;
    seen.add(id);

    out.push({ id, title: rawTitle, body, meta: metaFor(rawTitle) });
  }

  return out;
}

/* ── Markdown renderers ─────────────────────────────────────────────── */

// ReactMarkdown escapes HTML by default and rehype-raw is deliberately not
// installed, so model output cannot inject markup here.
const components = {
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mt-8 mb-3 text-[1.02rem] font-semibold tracking-tight">{children}</h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="mt-6 mb-2 text-[0.94rem] font-semibold">{children}</h4>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-4 leading-[1.75] text-foreground/85">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-5 space-y-2.5">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-5 list-decimal space-y-2.5 pl-5 marker:text-faint">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="relative pl-5 leading-[1.7] text-foreground/85 marker:text-faint
                   before:absolute before:left-0 before:top-[0.62em] before:h-1 before:w-1
                   before:rounded-full before:bg-[var(--color-signal-500)]/60
                   [ol_&]:pl-0 [ol_&]:before:hidden">
      {children}
    </li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="not-italic text-faint">{children}</em>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-hairline underline-offset-4 transition-colors
                 hover:text-[var(--color-signal-500)]"
    >
      {children}
    </a>
  ),
  // Wide tables scroll inside their own container; the page never scrolls sideways.
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-6 overflow-x-auto rounded-lg border border-hairline">
      <table className="w-full border-collapse text-[0.88rem]">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-foreground/[0.04]">{children}</thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border-b border-hairline px-4 py-2.5 text-left text-[0.72rem]
                   font-semibold uppercase tracking-wider text-faint">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="tnum border-b border-hairline px-4 py-2.5 text-foreground/85">
      {children}
    </td>
  ),
  hr: () => <hr className="my-8 border-hairline" />,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="tnum rounded bg-foreground/[0.07] px-1.5 py-0.5 text-[0.86em]">
      {children}
    </code>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-5 border-l-2 border-[var(--color-signal-500)] pl-5 text-faint">
      {children}
    </blockquote>
  ),
};

/* ── Section ────────────────────────────────────────────────────────── */

const TONE_STYLES: Record<Tone, string> = {
  verdict: "border-[var(--color-signal-500)]/35 bg-[var(--color-signal-500)]/[0.055]",
  warn:    "border-[var(--color-day-2)]/35 bg-[var(--color-day-2)]/[0.05]",
  info:    "border-[var(--color-sage-500)]/30 bg-[var(--color-sage-500)]/[0.05]",
  plain:   "border-hairline bg-transparent",
};

const TONE_ICON: Record<Tone, string> = {
  verdict: "text-[var(--color-signal-500)] bg-[var(--color-signal-500)]/12",
  warn:    "text-[var(--color-day-2)] bg-[var(--color-day-2)]/12",
  info:    "text-[var(--color-sage-500)] bg-[var(--color-sage-500)]/12",
  plain:   "text-faint bg-foreground/[0.05]",
};

export function ItinerarySection({ section }: { section: Section }) {
  const Icon = section.meta.icon;
  const toned = section.meta.tone !== "plain";

  return (
    <section
      id={section.id}
      // Headings clear the sticky nav when jumped to from the rail.
      className="scroll-mt-24 animate-rise"
    >
      <div className="mb-5 flex items-center gap-3">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
            TONE_ICON[section.meta.tone]
          }`}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <h2 className="display text-[1.55rem] font-semibold tracking-tight sm:text-[1.75rem]">
          {section.title}
        </h2>
      </div>

      <div
        className={
          toned
            ? `rounded-xl border p-5 sm:p-6 ${TONE_STYLES[section.meta.tone]}`
            : ""
        }
      >
        <div className="text-[0.94rem]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {section.body}
          </ReactMarkdown>
        </div>
      </div>
    </section>
  );
}

/* ── Section rail ───────────────────────────────────────────────────── */

export function SectionRail({
  sections,
  active,
}: {
  sections: Section[];
  active: string | null;
}) {
  const items = useMemo(() => sections.map((s) => ({ id: s.id, title: s.title })), [sections]);
  if (items.length < 2) return null;

  return (
    <nav aria-label="Itinerary sections" className="hidden xl:block">
      <p className="eyebrow mb-4">Contents</p>
      <ul className="space-y-0.5 border-l border-hairline">
        {items.map((s) => {
          const isActive = active === s.id;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={isActive ? "location" : undefined}
                className={`-ml-px block border-l-2 py-1.5 pl-4 text-[0.82rem] leading-snug
                            transition-[color,border-color] duration-200 ${
                              isActive
                                ? "border-[var(--color-signal-500)] font-medium text-foreground"
                                : "border-transparent text-faint hover:border-hairline hover:text-foreground"
                            }`}
              >
                {s.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
