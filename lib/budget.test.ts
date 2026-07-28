/**
 * Run: npx tsx lib/budget.test.ts
 *
 * The fixture is the real Budget breakdown from a live Karachi → Berlin
 * itinerary, buffer double-count and all. Synthetic input would not have
 * caught it: the bug needed the model's own mix of local prices, bracketed
 * conversions, nested activity bullets and free entries.
 */
import assert from "node:assert";
import { reconcileBudget, amountOn } from "./budget";

const BROKEN = `## Budget breakdown
- **Flights**: US$249 (≈ PKR 69,222)
- **Lodging**: €10/night × 3 nights = €30 (≈ PKR 9,480)
- **Food**: €12/day × 3 days = €36 (≈ PKR 11,376)
- **Transit**: 3 × €11.20 (24-hour AB ticket) = €33.60 (≈ PKR 10,618)
- **Activities**:
  - Topography of Terror: free
  - Reichstag dome: free (book in advance)
  - Pergamon Museum: €14 (≈ PKR 4,424) *(fee not confirmed for 2026)*
- **Buffer**: 10% of subtotal (PKR 10,512)
**Subtotal**: PKR 115,632
**Total**: **PKR 126,144**
**BUDGET VERDICT**: *Comfortable — PKR 273,856 surplus, no stress needed.*

## Getting there
From Karachi → Berlin, the cheapest flight is US$249 (≈ PKR 69,222).`;

/* ── the conversion on a line is the traveller's, not the local price ── */
assert.strictEqual(amountOn("- **Lodging**: €10/night × 3 nights = €30 (≈ PKR 9,480)", "PKR"), 9480);
assert.strictEqual(amountOn("- **Flights**: US$249 (≈ PKR 69,222)", "PKR"), 69222);
assert.strictEqual(amountOn("  - Topography of Terror: free", "PKR"), null);
// A euro trip has no bracket, so the price itself is the only match.
assert.strictEqual(amountOn("- **Lodging**: €10/night × 3 nights = €30", "EUR"), 30);
// "Rs" is the PKR symbol and must count as well as the code.
assert.strictEqual(amountOn("- **Food**: Rs3,160/day", "PKR"), 3160);

/* ── the arithmetic ─────────────────────────────────────────────────── */
const fixed = reconcileBudget(BROKEN, 400000, "PKR");

const SUBTOTAL = 69222 + 9480 + 11376 + 10618 + 4424; // 105,120
const TOTAL = SUBTOTAL * 1.1; // 115,632

assert.match(fixed, /\*\*Subtotal \(before buffer\)\*\*: PKR 105,120/);
assert.match(fixed, /\*\*Total\*\*: PKR 115,632/);
assert.match(fixed, /Comfortable — PKR 284,368 surplus/);
assert.strictEqual(SUBTOTAL, 105120);
assert.strictEqual(Math.round(TOTAL), 115632);

// The buffer must not be counted twice — the bug this exists to prevent.
assert.ok(!fixed.includes("126,144"), "buffer still double-counted");

// Line items are the model's and must survive untouched.
assert.match(fixed, /Topography of Terror: free/);
assert.match(fixed, /Pergamon Museum: €14 \(≈ PKR 4,424\)/);
assert.match(fixed, /US\$249/);

// Neighbouring sections must not be disturbed.
assert.match(fixed, /## Getting there\nFrom Karachi → Berlin/);

/* ── it must decline rather than guess ──────────────────────────────── */
assert.strictEqual(reconcileBudget("## Essentials\nNo budget here.", 400000, "PKR"),
  "## Essentials\nNo budget here.");
assert.strictEqual(reconcileBudget(BROKEN, 0, "PKR"), BROKEN);
assert.strictEqual(reconcileBudget(BROKEN, NaN, "PKR"), BROKEN);

/* ── over-budget verdict flips ──────────────────────────────────────── */
assert.match(reconcileBudget(BROKEN, 50000, "PKR"), /Over budget by PKR 65,632/);

console.log("budget: all checks passed");
