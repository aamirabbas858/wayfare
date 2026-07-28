// Relative rather than aliased so this stays runnable outside the Next build,
// which is what lets the check at the bottom of this folder execute directly.
import { resolveCurrency } from "./currency";

/**
 * Recomputes the budget totals from the line items the model wrote.
 *
 * Three arithmetic bugs in a row came from the same place: the model was
 * asked to do sums. A €11.20 pass became "Rs 11"; one hostel had two
 * different nightly rates; then the buffer was added to a subtotal that
 * already contained it, overstating a trip by 8%.
 *
 * `lib/fx.ts` already settled the principle for exchange rates — compute in
 * code, hand the model finished numbers. The same applies here, with one
 * difference: the line items are the model's to choose, and only the
 * arithmetic over them is ours. So the prices stay exactly as written and
 * the subtotal, buffer, total and verdict are replaced with figures that
 * are correct by construction.
 *
 * Applied at parse time rather than generation time, so trips already saved
 * are corrected when they are next opened.
 */

/** Buffer the prompt asks for, as a fraction of the pre-buffer subtotal. */
const BUFFER_RATE = 0.1;

/** Lines that state a computed figure rather than a cost being counted. */
const DERIVED = /buffer|subtotal|running total|^\W*total\b|budget verdict|total activities/i;

/**
 * The traveller-currency amount on a line, or null.
 *
 * A line can carry several currencies — "€30 (≈ PKR 9,480)" — and the last
 * occurrence of the traveller's own is the one that counts, because the
 * conversion is written after the local price. For a trip already in EUR
 * there is no bracket and the only match is the price itself.
 */
export function amountOn(line: string, code: string): number | null {
  const { symbol } = resolveCurrency(code);
  const tokens = [code, symbol].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?:${tokens.join("|")})\\s*([\\d][\\d,]*(?:\\.\\d+)?)`, "gi");

  let last: number | null = null;
  for (const m of line.matchAll(re)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n)) last = n;
  }
  return last;
}

function money(n: number, code: string): string {
  return `${code} ${Math.round(n).toLocaleString("en-GB")}`;
}

/**
 * Rewrites the `## Budget breakdown` section of an itinerary in place.
 *
 * Returns the markdown untouched when there is no budget section, no
 * parseable line item, or no budget to compare against — a wrong correction
 * would be worse than the inconsistency it replaces.
 */
export function reconcileBudget(
  markdown: string,
  budget: number,
  code: string
): string {
  if (!markdown || !Number.isFinite(budget) || budget <= 0) return markdown;

  // The section runs from its heading to the next one, or to the end.
  const start = markdown.search(/^##\s+Budget breakdown\s*$/mi);
  if (start === -1) return markdown;

  const rest = markdown.slice(start);
  const nextIdx = rest.slice(1).search(/^##\s+/m);
  const end = nextIdx === -1 ? markdown.length : start + 1 + nextIdx;

  const section = markdown.slice(start, end);
  const lines = section.split("\n");

  const kept: string[] = [];
  let subtotal = 0;
  let counted = 0;

  for (const line of lines) {
    if (DERIVED.test(line)) continue; // recomputed below

    const amount = amountOn(line, code);
    // Only bullets carry costs. Prose in this section is commentary.
    if (amount !== null && /^\s*[-*]/.test(line)) {
      subtotal += amount;
      counted++;
    }
    kept.push(line);
  }

  if (!counted) return markdown;

  const buffer = subtotal * BUFFER_RATE;
  const total = subtotal + buffer;
  const diff = budget - total;

  const verdict =
    total > budget
      ? `**BUDGET VERDICT**: Over budget by ${money(-diff, code)} — cut the most expensive line above.`
      : total < budget * 0.85
        ? `**BUDGET VERDICT**: Comfortable — ${money(diff, code)} surplus, no stress needed.`
        : `**BUDGET VERDICT**: Workable — ${money(diff, code)} surplus, keep an eye on food spend.`;

  const body = [
    ...kept.join("\n").trimEnd().split("\n"),
    "",
    `- **Buffer (${Math.round(BUFFER_RATE * 100)}%)**: ${money(buffer, code)}`,
    "",
    `**Subtotal (before buffer)**: ${money(subtotal, code)}`,
    "",
    `**Total**: ${money(total, code)}`,
    "",
    verdict,
    "",
  ].join("\n");

  return markdown.slice(0, start) + body + markdown.slice(end);
}
