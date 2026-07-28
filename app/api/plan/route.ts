import { tavily } from "@tavily/core";
import { resolveCurrency } from "@/lib/currency";
import { NextRequest } from "next/server";
import { generateSequence, hasProvider } from "@/lib/llm";
import { ratesFor, conversionNote } from "@/lib/fx";

export const maxDuration = 300;

// Built on first use rather than at import. The Tavily constructor throws when
// the key is missing, and at module scope that throw happens while Next is
// collecting page data — so one absent environment variable fails the whole
// production build rather than the one route that needs it. The same reasoning
// already applies to DATABASE_URL: a missing key should degrade a feature, not
// take the site down.
let tavilyClient: ReturnType<typeof tavily> | null = null;

function getTavily() {
  if (!process.env.TAVILY_API_KEY) return null;
  tavilyClient ??= tavily({ apiKey: process.env.TAVILY_API_KEY });
  return tavilyClient;
}

// Search results are the bulk of the prompt, and free-tier providers reject
// oversized requests outright with HTTP 413. Capping per result and per search
// keeps the total predictable regardless of how verbose a page happens to be.
const MAX_RESULT_CHARS = 700;
const MAX_SEARCH_CHARS = 2200;

function clip(text: string, limit: number): string {
  const t = text.trim();
  return t.length <= limit ? t : `${t.slice(0, limit).trimEnd()}…`;
}

async function executeSearch(query: string): Promise<string> {
  const client = getTavily();
  if (!client) return `[Search unavailable for: ${query}]`;
  try {
    const results = await client.search(query, {
      maxResults: 3,
      searchDepth: "basic",
    });
    const joined = results.results
      .map((r) => `${r.title}\n${clip(r.content ?? "", MAX_RESULT_CHARS)}`)
      .join("\n\n");
    return clip(joined, MAX_SEARCH_CHARS);
  } catch {
    return `[Search failed for: ${query}]`;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Fail fast and clearly rather than running four Tavily searches first
    // and only then discovering there is nothing to generate with.
    if (!hasProvider()) {
      return new Response(
        JSON.stringify({
          error:
            "No planning provider is configured. Set any one of MISTRAL_API_KEY, NVIDIA_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY or GEMINI_API_KEY.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json();
    const { destination, origin, startDate, endDate, budget, travelers, interests, currency } = body;

    if (!destination || !origin || !startDate || !endDate || !budget || !interests) {
      return new Response(
        JSON.stringify({ error: "Please fill in all required fields." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Length caps: these fields are interpolated into search queries and the
    // prompt, so unbounded input means unbounded token spend on my API keys.
    const field = (v: unknown, max: number) => String(v).slice(0, max).trim();
    const dest       = field(destination, 80);
    const orig       = field(origin, 80);
    const interestsT = field(interests, 500);

    const days = Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (!Number.isFinite(days) || days <= 0 || days > 60) {
      return new Response(
        JSON.stringify({ error: "End date must be after start date (trips up to 60 days)." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // The ceiling only exists to reject nonsense, and it has to clear
    // currencies with small unit values — a fortnight in PKR, INR or JPY runs
    // into seven figures perfectly legitimately.
    const budgetNum = parseInt(String(budget), 10);
    if (!Number.isFinite(budgetNum) || budgetNum < 1 || budgetNum > 1_000_000_000) {
      return new Response(
        JSON.stringify({ error: "Budget must be a positive number." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Unrecognised codes fall back to EUR, so nothing arbitrary reaches the prompt.
    const cur = resolveCurrency(currency);

    // Real rates, fetched here rather than asked of the model. Told to
    // "convert into PKR" the model relabels instead of converting, which
    // turned a €60 fine into "Rs 60" — out by a factor of 300.
    const fx = await ratesFor(cur.code);
    const conversion = conversionNote(fx, cur.label);

    const today = new Date().toISOString().split("T")[0];
    const year = new Date(startDate).getFullYear();
    const month = new Date(startDate).toLocaleString("default", { month: "long" });

    const numTravelers = Math.min(Math.max(parseInt(String(travelers || "1"), 10) || 1, 1), 20);
    const dailyPerPerson = Math.round(budgetNum / numTravelers / days);

    // Predefined searches — run in parallel for speed and reliability
    const travelerSuffix = numTravelers > 1 ? ` for ${numTravelers} people` : "";
    const searchQueries = [
      `${orig} to ${dest} flights ${month} ${year}${numTravelers > 1 ? ` ${numTravelers} passengers` : ""}`,
      `${dest} public transport day pass week pass price ${year}`,
      `${dest} budget accommodation hostels hotels ${month} ${year} prices${travelerSuffix}`,
      `${dest} top attractions entrance fees opening hours ${year}`,
    ];

    const searchResults = await Promise.all(
      searchQueries.map(async (q, i) => {
        const r = await executeSearch(q);
        return `### Search ${i + 1}: ${q}\n${r}`;
      })
    );

    // Passes get only the searches they need. Resending all four to every
    // pass was the main reason multi-pass generation tripped Groq's
    // tokens-per-minute limit: the day blocks were carrying flight and hotel
    // results they never refer to.
    const searchContext = searchResults.join("\n\n---\n\n");
    const placesContext = searchResults[3] ?? "";   // attractions and fees
    const transitContext = searchResults[1] ?? "";  // passes and validation

    const systemPrompt = `You are an experienced, honest travel planner who has LIVED in ${dest} for years. You give zero-bullshit advice — no sugarcoating, no over-hyping, no "immerse yourself in the vibrant culture" filler.

CRITICAL RULES:
1. Use REAL current prices from the search results provided. Never write "around" or "approximately". If a price is NOT in the search results, do not supply one from memory — write "price not confirmed" and move on. An admitted gap is worth more than a number the reader cannot rely on, and entrance fees are where this goes wrong most often: they change yearly, plenty of places are free, and a fee invented for a free museum is the kind of error that makes every other figure suspect.
2. Account for SEASONALITY when pricing.
3. NAME specific places — "Wombat's Hostel near Liverpool Street" not "a hostel".
4. ASSESS budget with honest arithmetic. Per-person daily budget = total ÷ travelers ÷ days. Compare against real costs in the search results. If the math works, say it works — clearly and without hedging. Only flag a budget as tight if the numbers genuinely do not add up. Never manufacture concern, and never say something is fine when it clearly is not.
5. EXPLAIN local concepts visitors won't intuit (transit validation, tipping norms, queueing).
6. INCLUDE a safety section with realistic concerns. Matter-of-fact, never fear-mongering.
7. For FOOD COSTS, always anchor on what a budget traveler actually eats: local market lunches, daily specials (prato do dia / plat du jour / menu del día), supermarkets, street food. These cost the local equivalent of 5-15 euros a day in cheap cities and 15-25 in expensive ones. Do NOT use tourist restaurant menu prices as the food budget — they are irrelevant to a budget traveler.
8. ${conversion}
9. ONE PRICE PER THING, EVERYWHERE. Each real-world cost — a specific hostel's nightly rate, the day pass, the daily food figure — is decided once and then reused verbatim in every section that mentions it: the daily minimum, the budget lines, the totals. Before writing a price, check whether you have already given that thing a price earlier in this document, and if so use that exact figure. Two different numbers for the same hostel means one of them was invented, and the reader has no way to tell which.
10. FORMATTING: use real line breaks. Never run several labelled items together in one paragraph. If a section asks for a list, emit a markdown list, one item per line.`;

    const tripFacts = `Trip details:
- Traveller departing from: ${orig}
- Destination: ${dest}
- Travel dates: ${startDate} to ${endDate} (${days} days)
- Group size: ${travelers} traveller(s)
- Total budget: ${cur.symbol}${budgetNum} (${cur.code})
- What they want: ${interestsT}

Today's date: ${today}`;

    // Full research for the overview; only what is relevant for the rest.
    const overviewContext = `${tripFacts}

Researched information, use it rather than recalling from memory:

${searchContext}`;

    const dayContext = `${tripFacts}

Attractions, opening hours and prices researched for this trip:

${placesContext}

${transitContext}`;

    const closingContext = `${tripFacts}

Researched information:

${placesContext}`;

    // Short trips are written in one request rather than three.
    //
    // Every pass resends the system prompt and its share of the research —
    // roughly 3,000 tokens of overhead each. For a two-day trip that overhead
    // is paid three times to produce a document that fits in one completion,
    // and Groq's free tier is 100,000 tokens per DAY, so the waste is the
    // difference between the site working and returning half an itinerary.
    // Splitting also introduces the failure it was meant to prevent: pass one
    // succeeds, the daily allowance runs out, and the reader gets an overview
    // with no days attached.
    //
    // Five days is the ceiling because the summed budgets below (3000 + 2100
    // + 2400) still fit inside the 8192-token completion cap. Longer trips
    // genuinely need the split.
    const SINGLE_PASS_MAX_DAYS = 5;
    const multiPass = days > SINGLE_PASS_MAX_DAYS;

    const overviewSections = `${
      multiPass
        ? "Write these sections and stop. Do not write the day-by-day plan yet."
        : "Write every section below, in the order given. Keep going to the end — the day-by-day plan and the closing sections are part of the same document."
    }

## The Essentials
Three short paragraphs, no budget talk. Each must contain a fact that appears in the search results above or a detail true only of ${dest} — a named operator, a specific street, a real amount, a date.

Write about: what has to be booked first and why waiting costs money; the local rule most likely to catch this traveller out; something useful that guidebooks leave out.

Do not open with "The single most...". Do not write "validate your ticket before boarding" unless the searches actually show that is how ${dest} works and the fine is real — it is the default answer for everywhere and it is often wrong. If nothing specific is known about ${dest} on one of these, write about something that is, and say plainly that the detail could not be confirmed.

## Reality check
Show the arithmetic on one line, then give the verdict:
"${cur.symbol}${dailyPerPerson}/day per person. Cheapest viable day in ${dest}: hostel ${cur.symbol}[X]/night + street food ${cur.symbol}[Y]/day + transit ${cur.symbol}[Z]/day = ${cur.symbol}[total]/day minimum. [Your budget covers this / barely covers this / does not cover this], so this trip is [comfortable / tight / over budget]."
${
      fx && fx.code !== "EUR"
        ? `Every figure on that line is a CONVERTED ${fx.code} amount. Convert each one with the rates above before adding them up — do not carry a local price over and change the symbol. A €11.20 day pass is ${cur.symbol}${Math.round(11.2 * fx.perEUR).toLocaleString("en-GB")} on that line, never ${cur.symbol}11. If the three components do not sum to the total, the line is wrong.\n`
        : ""
    }The hostel, food and transit figures you choose here are the ones for the whole document. Budget breakdown below reuses these exact numbers — it does not price the same hostel again and arrive somewhere different.

Then one sentence: the single most important current gotcha for ${dest} (seasonal price spike, closed attraction, booking requirement). Nothing else.

## Book today
A markdown list, one bullet per item. Never a paragraph.
Each bullet: what to book, where to book it, the price from the searches, and what it costs to wait.

## Budget breakdown
Line-by-line per-person costs using the cheapest realistic options from search results:
  - Flights (cheapest found)
  - Lodging: cheapest hostel/hotel per night × ${days} nights
  - Food: local market lunch + street food estimate per day × ${days} days (NOT tourist restaurant prices)
  - Transit: cheapest pass for this trip length
  - Activities: named places, each with the entrance fee as it appears in the searches. Write "free" where entry is free and "fee not confirmed" where the searches do not give one — never a guessed amount.
  - Buffer: 10% of subtotal
Put each line on its own bullet. Put the running total on its own separate line, and the verdict on another line after it — never append the total or the verdict to the end of the buffer bullet. Then one of:
  • If total < ${cur.symbol}${budgetNum} × 0.85 → "BUDGET VERDICT: Comfortable — ${cur.symbol}X surplus, no stress needed."
  • If total < ${cur.symbol}${budgetNum} → "BUDGET VERDICT: Workable — ${cur.symbol}X surplus, keep an eye on food spend."
  • If total > ${cur.symbol}${budgetNum} → "BUDGET VERDICT: Over budget by ${cur.symbol}X — suggest [specific cut]."
The verdict lives here, not in The Essentials.

## Getting there
From ${orig} → ${dest}. Use flight prices from the searches. Cheapest day, cheapest airline. Airport-to-city transfer with exact transit info.

## Where to stay
3 NAMED options at different price points using the accommodation search results. Skip if user mentions staying with friends.

## Local transit
A markdown list, one bullet per point. Never a paragraph.
- The exact pass for a ${days}-day trip, with its real price from the searches
- Where to buy it
- How validation works here, or state plainly that it could not be confirmed
- The actual fine for travelling without a valid ticket, in the local currency
- One thing about the system that catches visitors out
${multiPass ? '\n\nStop after "Local transit". Do not continue past it.' : ""}`;

    const partOne = `${overviewContext}

---

${overviewSections}`;

    // A 14-day itinerary at four stops a day does not fit in one completion,
    // and the failure is silent — the model stops and the reader thinks the
    // plan is finished. Days are generated in blocks so trip length stops
    // being a constraint.
    // Measured against real output: a day is roughly 190 characters per stop,
    // so twelve days at four stops is about 2,300 tokens. That fits one
    // completion comfortably. The original failure was not that days are
    // large — it was that all fifteen sections shared a single budget and the
    // earlier ones ate it, leaving the itinerary to stop at day two.
    //
    // Splitting every four days therefore fixed the wrong thing and cost six
    // requests where three will do. Free tiers meter requests as well as
    // tokens, so fewer passes is the difference between working and 429.
    const DAYS_PER_PASS = 12;
    const dayBlocks: Array<[number, number]> = [];
    for (let d = 1; d <= days; d += DAYS_PER_PASS) {
      dayBlocks.push([d, Math.min(d + DAYS_PER_PASS - 1, days)]);
    }

    // Detail per day scales down as trips get longer, so a fortnight stays
    // readable and affordable rather than being cut off half way.
    const stopsPerDay = days <= 5 ? "4-6" : days <= 10 ? "3-5" : "3-4";

    const daySections = (from: number, to: number, i: number) => `${
      multiPass ? `Write ONLY days ${from} to ${to} of this ${days}-day trip. ` : ""
    }${
      i === 0
        ? "Day 1 is arrival, so plan around the arrival time rather than a full day."
        : "These are middle days; assume the traveller is already there and settled."
    }${to === days ? " The final day is departure — keep it light and near transport." : ""}

${i === 0 ? "Begin with the heading `## Day-by-day plan` on its own line, then the days." : "Do NOT repeat the `## Day-by-day plan` heading — continue straight from the previous days."}

Each day gets its own \`### Day N\` heading, then ${stopsPerDay} bullets, one per stop:
time — place name + neighbourhood (nearest transit stop). Real price. One honest sentence on whether it is worth it.

### Day ${from}
- 09:30 — Café Aloma, Campo de Ourique (tram 28 to Rua Saraiva de Carvalho). €2.20 for a pastel de nata and a bica. Locals outnumber tourists before 11:00; after that the queue is not worth it.

Keep every stop inside days ${from}-${to}.${
      multiPass ? " Do not write any other section. Do not summarise." : ""
    }`;

    const dayParts = dayBlocks.map(
      ([from, to], i) => `${dayContext}\n\n---\n\n${daySections(from, to, i)}`
    );

    const closingSections = `${
      multiPass
        ? `The itinerary above has already covered the essentials, budget, transport, lodging and all ${days} days. Write ONLY these closing sections:`
        : "Then continue straight on with these closing sections:"
    }

## Tourist traps to skip
Specific places NOT worth it with what to do instead.

## Cheap food map
3-5 named places locals actually eat at. Honest daily food budget. Price ranges.

## Safety briefing
Real local concerns. Specific pickpocket hotspots, common scams.

## Local quirks
3-5 things outsiders DON'T intuit.

## Practical
SIM/eSIM, tipping norms, tap water, emergency number, useful local apps.

## Verify before booking
3-5 specific claims to double-check.

## Map data
A JSON array of every named place mentioned anywhere in this trip, in a code block:

\`\`\`json
[
  {"name": "Bonanza Coffee Heroes", "address": "Oderberger Str. 35", "lat": 52.5398, "lng": 13.4051, "day": 1, "type": "cafe"}
]
\`\`\`

Real coordinates. day must be between 1 and ${days}. Type: cafe/restaurant/attraction/museum/park/market/bar/transit/hotel/neighborhood.

At most 3 entries per day and no more than ${Math.min(36, days * 3)} in total — pick the places worth finding on a map. List each place once even if the itinerary visits it twice. A complete short list beats a long one that gets cut off half way.

NEVER write "around" or "approximately" for prices. No filler, no clichés. Markdown only.`;

    const partThree = `${closingContext}\n\n---\n\n${closingSections}`;

    // One pass for the overview, one per block of days, one for the closing
    // sections. Each falls through Groq → Gemini → OpenRouter independently,
    // so an exhausted quota part-way still leaves the earlier passes intact.
    // Budgets are sized to what each pass actually writes. A request reserves
    // its stated maximum against a free tier's tokens-per-minute allowance
    // whether it uses it or not, so asking for 8192 on a four-day block was
    // spending the allowance on nothing.
    // Sized from measured output rather than guessed: ~55 tokens per stop,
    // plus headroom. A three-day trip does not reserve a fortnight's budget.
    const daysInBlock = (from: number, to: number) => to - from + 1;
    const dayBudget = ([from, to]: [number, number]) =>
      Math.min(6000, 400 + daysInBlock(from, to) * (days <= 5 ? 340 : 260));

    const passes: Array<{ user: string; maxTokens: number }> = multiPass
      ? [
          { user: partOne, maxTokens: 3000 },
          ...dayParts.map((user, i) => ({ user, maxTokens: dayBudget(dayBlocks[i]) })),
          // The closing pass carries six prose sections plus the map data,
          // and the map grows with the trip while the prose does not. A flat
          // 2,400 was enough for three days and ran out mid-array on twelve,
          // ending the JSON on `{"name":` — which cost a long trip every one
          // of its pins. Roughly 50 tokens per place, three places a day.
          { user: partThree, maxTokens: Math.min(6000, 2200 + days * 170) },
        ]
      : [
          {
            // One request, one context. overviewContext carries all four
            // searches, so the day and closing sections lose nothing by not
            // being sent their own copies — they were subsets of it anyway.
            user: `${overviewContext}

---

${overviewSections}

${daySections(1, days, 0)}

${closingSections}`,
            maxTokens: Math.min(8000, 3000 + dayBudget([1, days]) + 2400),
          },
        ];

    const stream = generateSequence(
      passes.map(({ user, maxTokens }) => ({
        system: systemPrompt,
        user,
        maxTokens,
        signal: request.signal,
      }))
    );

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    console.error("API error:", error);
    const message = error instanceof Error ? error.message : "Something went wrong";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}