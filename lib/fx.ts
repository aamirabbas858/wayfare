import "server-only";

/**
 * Exchange rates.
 *
 * The model used to be told "convert every price into the user's currency".
 * It does not convert — it relabels. A €60 fine in Lisbon came back as
 * "Rs 60" for a traveller from Karachi, understating it by roughly 300×.
 * That is not a formatting bug; someone could budget on it.
 *
 * Language models have no exchange rates and no arithmetic guarantees, so
 * conversion is done here, from a real source, and the model is given the
 * finished numbers rather than asked to produce them.
 */

const SOURCE = "https://open.er-api.com/v6/latest/EUR";

// Rates move slowly relative to how often a trip is planned, and a stale rate
// is far better than a failed request. Cached per server instance.
const TTL_MS = 6 * 60 * 60 * 1000;

let cache: { at: number; rates: Record<string, number> } | null = null;

/** Fallback used only when the rate service is unreachable. Approximate, and
 *  flagged as such downstream so nothing claims more precision than it has. */
const FALLBACK_PER_EUR: Record<string, number> = {
  EUR: 1, USD: 1.09, GBP: 0.84, CHF: 0.95, PLN: 4.3, SEK: 11.3,
  CZK: 25.2, JPY: 168, INR: 91, PKR: 303, AUD: 1.65, CAD: 1.48,
  TRY: 38, AED: 4.0,
};

async function rates(): Promise<{ rates: Record<string, number>; live: boolean }> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { rates: cache.rates, live: true };
  }
  try {
    const res = await fetch(SOURCE, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const data = (await res.json()) as { rates?: Record<string, number> };
    if (!data.rates?.USD) throw new Error("unexpected payload");
    cache = { at: Date.now(), rates: data.rates };
    return { rates: data.rates, live: true };
  } catch (err) {
    console.error("[fx] rate lookup failed, using fallback:", err);
    return { rates: FALLBACK_PER_EUR, live: false };
  }
}

export interface RateTable {
  /** How many units of the traveller's currency one unit of each major buys. */
  perEUR: number;
  perUSD: number;
  perGBP: number;
  code: string;
  live: boolean;
}

/**
 * Rates into the traveller's currency, for the currencies destination prices
 * are usually quoted in.
 */
export async function ratesFor(code: string): Promise<RateTable | null> {
  const { rates: r, live } = await rates();
  const target = r[code.toUpperCase()];
  if (!target) return null;

  const perEUR = target; // 1 EUR → target
  const perUSD = r.USD ? target / r.USD : perEUR / 1.09;
  const perGBP = r.GBP ? target / r.GBP : perEUR / 0.84;

  return {
    perEUR: round(perEUR),
    perUSD: round(perUSD),
    perGBP: round(perGBP),
    code: code.toUpperCase(),
    live,
  };
}

/** Two significant figures past the point for small rates, whole numbers for
 *  large ones — "303" rather than "303.4171" for PKR. */
function round(n: number): number {
  if (n >= 100) return Math.round(n);
  if (n >= 10) return Math.round(n * 10) / 10;
  return Math.round(n * 100) / 100;
}

/**
 * The conversion guidance handed to the model.
 *
 * Prices stay in the currency the destination actually charges, because that
 * is what the traveller will hand over and what the search results can be
 * checked against. The traveller's currency appears alongside, computed from
 * a real rate, so the number means something to them.
 */
export function conversionNote(table: RateTable | null, currencyLabel: string): string {
  if (!table || table.code === "EUR") {
    return `Quote every price in the currency the destination actually charges. Never invent a conversion.`;
  }

  const stale = table.live ? "" : " (rates are indicative)";

  return `CURRENCY — read carefully, this has caused real harm before.

Quote every price in the currency the destination actually charges, exactly as the search results give it. Do NOT convert prices into ${currencyLabel} yourself and do NOT simply swap the symbol: writing a €60 fine as "${table.code} 60" understates it by a factor of ${Math.round(table.perEUR)} and is worse than saying nothing.

Immediately after each price, add the ${table.code} equivalent in brackets, calculated with these rates${stale}:
  1 EUR = ${table.perEUR} ${table.code}
  1 USD = ${table.perUSD} ${table.code}
  1 GBP = ${table.perGBP} ${table.code}

So a sixty-euro fine is written: €60 (≈ ${table.code} ${Math.round(60 * table.perEUR).toLocaleString("en-GB")}).

Round the bracketed figure sensibly — no decimals on large numbers. The traveller's budget is in ${table.code}, so all budget totals and per-day figures are in ${table.code} with the local equivalent in brackets instead: that is the one place the order reverses.`;
}
