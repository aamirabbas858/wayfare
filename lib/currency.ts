/**
 * Supported budget currencies.
 *
 * Shared by the form, the live budget readout and the prompt, so the symbol a
 * user picks is the symbol the itinerary is written in. Without this the model
 * echoes whatever currency the source pages happened to use — search results
 * for Barcelona hotels returned złoty and dollars in testing.
 */
export const CURRENCIES = [
  { code: "EUR", symbol: "€",  label: "Euro" },
  { code: "USD", symbol: "$",  label: "US dollar" },
  { code: "GBP", symbol: "£",  label: "Pound sterling" },
  { code: "CHF", symbol: "CHF", label: "Swiss franc" },
  { code: "PLN", symbol: "zł", label: "Polish złoty" },
  { code: "SEK", symbol: "kr", label: "Swedish krona" },
  { code: "CZK", symbol: "Kč", label: "Czech koruna" },
  { code: "JPY", symbol: "¥",  label: "Japanese yen" },
  { code: "INR", symbol: "₹",  label: "Indian rupee" },
  { code: "PKR", symbol: "Rs", label: "Pakistani rupee" },
  { code: "AUD", symbol: "A$", label: "Australian dollar" },
  { code: "CAD", symbol: "C$", label: "Canadian dollar" },
  { code: "TRY", symbol: "₺",  label: "Turkish lira" },
  { code: "AED", symbol: "AED", label: "UAE dirham" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const DEFAULT_CURRENCY: CurrencyCode = "EUR";

/** Falls back to the default for anything unrecognised, so a tampered or
 *  stale request can never inject arbitrary text into the prompt. */
export function resolveCurrency(code: unknown) {
  const found = CURRENCIES.find(
    (c) => c.code === String(code ?? "").toUpperCase()
  );
  return found ?? CURRENCIES[0];
}

/** Formats a whole-number amount for display, e.g. "€63" or "Rs 4,200". */
export function formatAmount(amount: number, code: unknown) {
  const { symbol } = resolveCurrency(code);
  const n = Math.round(amount).toLocaleString("en-GB");
  // Multi-character symbols read better with a space: "CHF 40", not "CHF40".
  return symbol.length > 1 ? `${symbol} ${n}` : `${symbol}${n}`;
}
