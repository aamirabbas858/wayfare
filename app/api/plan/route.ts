import { tavily } from "@tavily/core";
import { resolveCurrency } from "@/lib/currency";
import { NextRequest } from "next/server";
import { generateSequence, hasProvider } from "@/lib/llm";
import { ratesFor, conversionNote } from "@/lib/fx";

export const maxDuration = 300;

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY! });

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
  try {
    const results = await tavilyClient.search(query, {
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
            "No planning provider is configured. Set GROQ_API_KEY, GEMINI_API_KEY or OPENROUTER_API_KEY.",
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

    const searchContext = searchResults.join("\n\n---\n\n");

    const systemPrompt = `You are an experienced, honest travel planner who has LIVED in ${dest} for years. You give zero-bullshit advice — no sugarcoating, no over-hyping, no "immerse yourself in the vibrant culture" filler.

CRITICAL RULES:
1. Use REAL current prices from the search results provided. Never write "around" or "approximately".
2. Account for SEASONALITY when pricing.
3. NAME specific places — "Wombat's Hostel near Liverpool Street" not "a hostel".
4. ASSESS budget with honest arithmetic. Per-person daily budget = total ÷ travelers ÷ days. Compare against real costs in the search results. If the math works, say it works — clearly and without hedging. Only flag a budget as tight if the numbers genuinely do not add up. Never manufacture concern, and never say something is fine when it clearly is not.
5. EXPLAIN local concepts visitors won't intuit (transit validation, tipping norms, queueing).
6. INCLUDE a safety section with realistic concerns. Matter-of-fact, never fear-mongering.
7. For FOOD COSTS, always anchor on what a budget traveler actually eats: local market lunches, daily specials (prato do dia / plat du jour / menu del día), supermarkets, street food. These cost the local equivalent of 5-15 euros a day in cheap cities and 15-25 in expensive ones. Do NOT use tourist restaurant menu prices as the food budget — they are irrelevant to a budget traveler.
8. ${conversion}
9. FORMATTING: use real line breaks. Never run several labelled items together in one paragraph. If a section asks for a list, emit a markdown list, one item per line.`;

    const sharedContext = `Trip details:
- Traveller departing from: ${orig}
- Destination: ${dest}
- Travel dates: ${startDate} to ${endDate} (${days} days)
- Group size: ${travelers} traveller(s)
- Total budget: ${cur.symbol}${budgetNum} (${cur.code})
- What they want: ${interestsT}

Today's date: ${today}

Researched information, use it rather than recalling from memory:

${searchContext}`;

    const partOne = `${sharedContext}

---

Write these sections and stop. Do not write the day-by-day plan yet.

## The Essentials
Three short paragraphs, no budget talk. Each must contain a fact that appears in the search results above or a detail true only of ${dest} — a named operator, a specific street, a real amount, a date.

Write about: what has to be booked first and why waiting costs money; the local rule most likely to catch this traveller out; something useful that guidebooks leave out.

Do not open with "The single most...". Do not write "validate your ticket before boarding" unless the searches actually show that is how ${dest} works and the fine is real — it is the default answer for everywhere and it is often wrong. If nothing specific is known about ${dest} on one of these, write about something that is, and say plainly that the detail could not be confirmed.

## Reality check
Show the arithmetic on one line, then give the verdict:
"${cur.symbol}${dailyPerPerson}/day per person. Cheapest viable day in ${dest}: hostel ${cur.symbol}[X]/night + street food ${cur.symbol}[Y]/day + transit ${cur.symbol}[Z]/day = ${cur.symbol}[total]/day minimum. [Your budget covers this / barely covers this / does not cover this], so this trip is [comfortable / tight / over budget]."
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
  - Activities: named places with real entrance fees
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


Stop after "Local transit". Do not continue past it.`;

    // A 14-day itinerary at four stops a day does not fit in one completion,
    // and the failure is silent — the model stops and the reader thinks the
    // plan is finished. Days are generated in blocks so trip length stops
    // being a constraint.
    const DAYS_PER_PASS = 4;
    const dayBlocks: Array<[number, number]> = [];
    for (let d = 1; d <= days; d += DAYS_PER_PASS) {
      dayBlocks.push([d, Math.min(d + DAYS_PER_PASS - 1, days)]);
    }

    // Detail per day scales down as trips get longer, so a fortnight stays
    // readable and affordable rather than being cut off half way.
    const stopsPerDay = days <= 5 ? "4-6" : days <= 10 ? "3-5" : "3-4";

    const dayParts = dayBlocks.map(([from, to], i) => `${sharedContext}

---

Write ONLY days ${from} to ${to} of this ${days}-day trip. ${
      i === 0
        ? "Day 1 is arrival, so plan around the arrival time rather than a full day."
        : "These are middle days; assume the traveller is already there and settled."
    }${to === days ? " The final day is departure — keep it light and near transport." : ""}

${i === 0 ? "Begin with the heading `## Day-by-day plan` on its own line, then the days." : "Do NOT repeat the `## Day-by-day plan` heading — continue straight from the previous days."}

Each day gets its own \`### Day N\` heading, then ${stopsPerDay} bullets, one per stop:
time — place name + neighbourhood (nearest transit stop). Real price. One honest sentence on whether it is worth it.

### Day ${from}
- 09:30 — Café Aloma, Campo de Ourique (tram 28 to Rua Saraiva de Carvalho). €2.20 for a pastel de nata and a bica. Locals outnumber tourists before 11:00; after that the queue is not worth it.

Keep every stop inside days ${from}-${to}. Do not write any other section. Do not summarise.`);

    const partThree = `${sharedContext}

---

The itinerary above has already covered the essentials, budget, transport, lodging and all ${days} days. Write ONLY these closing sections:

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

NEVER write "around" or "approximately" for prices. No filler, no clichés. Markdown only.`;

    // One pass for the overview, one per block of days, one for the closing
    // sections. Each falls through Groq → Gemini → OpenRouter independently,
    // so an exhausted quota part-way still leaves the earlier passes intact.
    const stream = generateSequence(
      [partOne, ...dayParts, partThree].map((user) => ({
        system: systemPrompt,
        user,
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