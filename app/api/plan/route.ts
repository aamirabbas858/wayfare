import { tavily } from "@tavily/core";
import { resolveCurrency } from "@/lib/currency";
import { NextRequest } from "next/server";
import {
  generateStream,
  hasProvider,
  providerStatus,
  probeProviders,
} from "@/lib/llm";

/**
 * Health check. Reports which providers the running deployment can see, and
 * whether the search key is present — booleans and key lengths only, never a
 * key or any fragment of one.
 *
 * This exists because Vercel bakes environment variables in at build time,
 * so "I added the variable" and "the deployment has it" are different
 * claims. Safe to delete once configuration has settled.
 */
export async function GET(request: NextRequest) {
  // ?probe=1 additionally sends a one-token request to each configured model
  // and reports the status code, so a bad key or a retired model id can be
  // diagnosed without server log access.
  const probe = request.nextUrl.searchParams.get("probe") === "1";

  return Response.json(
    {
      ok: hasProvider(),
      providers: providerStatus(),
      ...(probe ? { probe: await probeProviders() } : {}),
      search: {
        envVar: "TAVILY_API_KEY",
        configured: Boolean(process.env.TAVILY_API_KEY),
      },
      hint: hasProvider()
        ? "At least one provider is configured."
        : "No provider key reached this build. In Vercel, confirm the variable is enabled for Production, then redeploy — env vars only apply to new builds.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

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

    const budgetNum = parseInt(String(budget), 10);
    if (!Number.isFinite(budgetNum) || budgetNum < 1 || budgetNum > 1_000_000) {
      return new Response(
        JSON.stringify({ error: "Budget must be a number between 1 and 1,000,000." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Unrecognised codes fall back to EUR, so nothing arbitrary reaches the prompt.
    const cur = resolveCurrency(currency);

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
8. EVERY price you write must be in ${cur.label} using the symbol ${cur.symbol}. Search results often quote other currencies because of where the page was published — convert them and print only the ${cur.code} figure. Never show a foreign-currency amount, and never write "approximately" or "around" beside a number: choose the figure you believe and state it.
9. FORMATTING: use real line breaks. Never run several labelled items together in one paragraph. If a section asks for a list, emit a markdown list, one item per line.`;

    const userPrompt = `Trip details:
- Traveler departing from: ${orig}
- Destination: ${dest}
- Travel dates: ${startDate} to ${endDate} (${days} days)
- Group size: ${travelers} traveler(s)
- Total budget: ${cur.symbol}${budgetNum} (${cur.code})
- What they want: ${interestsT}

Today's date: ${today}

I have already researched current information for you. Use the search results below to inform your response.

${searchContext}

---

Now deliver a complete travel plan with this EXACT structure:

## The Essentials
3 sentences, no budget discussion: (1) The single most time-sensitive booking for this specific trip and exactly why it needs to go TODAY; (2) the single most important local rule or watch-out in ${dest} that catches first-time visitors off guard; (3) one practical tip specific to ${dest} that guidebooks don't mention.

## Reality check
Show the arithmetic on one line, then give the verdict:
"${cur.symbol}${dailyPerPerson}/day per person. Cheapest viable day in ${dest}: hostel ${cur.symbol}[X]/night + street food ${cur.symbol}[Y]/day + transit ${cur.symbol}[Z]/day = ${cur.symbol}[total]/day minimum. [Your budget covers this / barely covers this / does not cover this], so this trip is [comfortable / tight / over budget]."
Then one sentence: the single most important current gotcha for ${dest} (seasonal price spike, closed attraction, booking requirement). Nothing else.

## Book today
Items to book NOW — flights, transit passes, popular reservations.

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
Exact pass for this trip length using prices from the transit search. Where to buy. Validation rules. Fine for not validating. Plus 2-3 sentences on how the system works.

## Day-by-day plan
This is the most important section. Give every day its own \`### Day N\` heading on its own line, then 4-6 bullet points under it — one bullet per stop.

Each bullet: time, place name + neighbourhood + nearest transit stop, real price, then one honest sentence about whether it is worth it.

Format it exactly like this, and never compress several days into one paragraph:

### Day 1
- 09:30 — Café Aloma, Campo de Ourique (tram 28 to Rua Saraiva de Carvalho). ${cur.symbol}2.20 for a pastel de nata and a bica. Locals outnumber tourists before 11:00; after that the queue is not worth it.
- 12:00 — ...

### Day 2
- ...

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
At the very end, output a JSON array of ALL named places. Format EXACTLY like this in a code block:

\`\`\`json
[
  {"name": "Bonanza Coffee Heroes", "address": "Oderberger Str. 35", "lat": 52.5398, "lng": 13.4051, "day": 1, "type": "cafe"}
]
\`\`\`

Include EVERY named place. Use realistic lat/lng. Type: cafe/restaurant/attraction/museum/park/market/bar/transit/hotel/neighborhood.

NEVER write "around" or "approximately" for prices. No filler, no clichés. Markdown only.`;

    // Falls through Groq → Gemini → OpenRouter, skipping any provider whose
    // key is absent. One exhausted quota no longer takes the product down.
    const stream = generateStream({
      system: systemPrompt,
      user: userPrompt,
      signal: request.signal,
    });

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