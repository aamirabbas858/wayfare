import { describe, expect, it } from "vitest";
import { amountOn, reconcileBudget } from "./budget";

/**
 * The fixture is the real Budget breakdown from a live Karachi → Berlin
 * itinerary, buffer double-count and all. A synthetic one would not have
 * caught the bug: it needed the model's own mix of local prices, bracketed
 * conversions, nested activity bullets and free entries.
 */
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

const SUBTOTAL = 69222 + 9480 + 11376 + 10618 + 4424; // 105,120

describe("amountOn", () => {
  it("takes the traveller's currency, not the local price", () => {
    // A line carries two currencies and the conversion follows the local
    // price, so the last occurrence is the one that counts.
    expect(amountOn("- **Lodging**: €10/night × 3 nights = €30 (≈ PKR 9,480)", "PKR")).toBe(9480);
    expect(amountOn("- **Flights**: US$249 (≈ PKR 69,222)", "PKR")).toBe(69222);
  });

  it("reads the price itself when there is no conversion", () => {
    expect(amountOn("- **Lodging**: €10/night × 3 nights = €30", "EUR")).toBe(30);
  });

  it("accepts the symbol as well as the code", () => {
    expect(amountOn("- **Food**: Rs3,160/day", "PKR")).toBe(3160);
  });

  it("returns null for a line with no money on it", () => {
    expect(amountOn("  - Topography of Terror: free", "PKR")).toBeNull();
  });
});

describe("reconcileBudget", () => {
  const fixed = reconcileBudget(BROKEN, 400000, "PKR");

  it("does not count the buffer twice", () => {
    // The bug: subtotal already included the buffer, then the total added it
    // again, overstating the trip by 8%.
    expect(fixed).not.toContain("126,144");
    expect(fixed).toContain("**Subtotal (before buffer)**: PKR 105,120");
    expect(fixed).toContain("**Total**: PKR 115,632");
  });

  it("computes the arithmetic the model got wrong", () => {
    expect(SUBTOTAL).toBe(105120);
    expect(Math.round(SUBTOTAL * 1.1)).toBe(115632);
    expect(fixed).toMatch(/Comfortable — PKR 284,368 surplus/);
  });

  it("leaves the model's line items untouched", () => {
    // Choosing what a hostel costs is the model's job. Only the arithmetic
    // over those choices is ours.
    expect(fixed).toContain("Topography of Terror: free");
    expect(fixed).toContain("Pergamon Museum: €14 (≈ PKR 4,424)");
    expect(fixed).toContain("US$249");
  });

  it("does not disturb neighbouring sections", () => {
    expect(fixed).toMatch(/## Getting there\nFrom Karachi → Berlin/);
  });

  it("flips the verdict when the trip does not fit", () => {
    expect(reconcileBudget(BROKEN, 50000, "PKR")).toMatch(/Over budget by PKR 65,632/);
  });

  it("declines rather than guessing", () => {
    // A confident wrong correction would be worse than the inconsistency it
    // replaces, so anything unparseable is returned untouched.
    const noBudgetSection = "## Essentials\nNo budget here.";
    expect(reconcileBudget(noBudgetSection, 400000, "PKR")).toBe(noBudgetSection);
    expect(reconcileBudget(BROKEN, 0, "PKR")).toBe(BROKEN);
    expect(reconcileBudget(BROKEN, NaN, "PKR")).toBe(BROKEN);
  });
});
