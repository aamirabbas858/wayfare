import Groq from "groq-sdk";
import { tavily } from "@tavily/core";
import { NextRequest } from "next/server";

export const maxDuration = 300;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY! });

async function executeSearch(query: string): Promise<string> {
  try {
    const results = await tavilyClient.search(query, {
      maxResults: 3,
      searchDepth: "basic",
    });
    return results.results
      .map((r) => `${r.title}\n${r.content}`)
      .join("\n\n");
  } catch {
    return `[Search failed for: ${query}]`;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { destination, origin, startDate, endDate, budget, travelers, interests } = body;

    if (!destination || !origin || !startDate || !endDate || !budget || !interests) {
      return new Response(
        JSON.stringify({ error: "Please fill in all required fields." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const days = Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (days <= 0) {
      return new Response(
        JSON.stringify({ error: "End date must be after start date." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const year = new Date(startDate).getFullYear();
    const month = new Date(startDate).toLocaleString("default", { month: "long" });

    const numTravelers = parseInt(travelers || "1");
    const dailyPerPerson = Math.round(parseInt(budget) / numTravelers / days);

    // Predefined searches — run in parallel for speed and reliability
    const travelerSuffix = numTravelers > 1 ? ` for ${numTravelers} people` : "";
    const searchQueries = [
      `${origin} to ${destination} flights ${month} ${year}${numTravelers > 1 ? ` ${numTravelers} passengers` : ""}`,
      `${destination} public transport day pass week pass price ${year}`,
      `${destination} budget accommodation hostels hotels ${month} ${year} prices${travelerSuffix}`,
      `${destination} top attractions entrance fees opening hours ${year}`,
    ];

    const searchResults = await Promise.all(
      searchQueries.map(async (q, i) => {
        const r = await executeSearch(q);
        return `### Search ${i + 1}: ${q}\n${r}`;
      })
    );

    const searchContext = searchResults.join("\n\n---\n\n");

    const systemPrompt = `You are an experienced, honest travel planner who has LIVED in ${destination} for years. You give zero-bullshit advice — no sugarcoating, no over-hyping, no "immerse yourself in the vibrant culture" filler.

CRITICAL RULES:
1. Use REAL current prices from the search results provided. Never write "around" or "approximately".
2. Account for SEASONALITY when pricing.
3. NAME specific places — "Wombat's Hostel near Liverpool Street" not "a hostel".
4. ASSESS budget with honest arithmetic. Per-person daily budget = total ÷ travelers ÷ days. Compare against real costs in the search results. If the math works, say it works — clearly and without hedging. Only flag a budget as tight if the numbers genuinely do not add up. Never manufacture concern, and never say something is fine when it clearly is not.
5. EXPLAIN local concepts visitors won't intuit (transit validation, tipping norms, queueing).
6. INCLUDE a safety section with realistic concerns. Matter-of-fact, never fear-mongering.
7. For FOOD COSTS, always anchor on what a budget traveler actually eats: local market lunches, daily specials (prato do dia / plat du jour / menu del día), supermarkets, street food. These cost €5-15/day in cheap cities and €15-25/day in expensive ones. Do NOT use tourist restaurant menu prices as the food budget — they are irrelevant to a budget traveler.`;

    const userPrompt = `Trip details:
- Traveler departing from: ${origin}
- Destination: ${destination}
- Travel dates: ${startDate} to ${endDate} (${days} days)
- Group size: ${travelers} traveler(s)
- Total budget: €${budget}
- What they want: ${interests}

Today's date: ${today}

I have already researched current information for you. Use the search results below to inform your response.

${searchContext}

---

Before writing any section, complete this budget pre-check silently:
DAILY_PER_PERSON = €${dailyPerPerson}
Estimate the CHEAPEST realistic daily spend for a budget traveler in ${destination}:
  A = cheapest hostel bed from search results ÷ 1 night
  B = street food / local lunch menu / supermarket meals — NOT tourist restaurant menus (€5-15 in cheap cities, €15-25 in expensive ones)
  C = cheapest transit pass ÷ days
  CHEAPEST_DAILY = A + B + C
Then:
  • If DAILY_PER_PERSON ≥ CHEAPEST_DAILY × 1.4 → verdict = COMFORTABLE (budget covers costs with clear room to spare)
  • If DAILY_PER_PERSON ≥ CHEAPEST_DAILY × 1.0 → verdict = TIGHT (covers minimum but no margin)
  • If DAILY_PER_PERSON < CHEAPEST_DAILY → verdict = OVER BUDGET (doesn't even cover minimum)
Lock in this verdict. Write every section consistent with it. Do not contradict it anywhere.

Now deliver a complete travel plan with this EXACT structure:

## The Essentials
3 sentences exactly: (1) Budget verdict in plain English — use the pre-check result, state it directly with no hedging ("This budget is comfortable", "This budget is tight", "This budget is generous"); (2) one thing to book TODAY; (3) biggest practical watch-out that is NOT about budget.

## Reality check
Per-person daily budget: €${dailyPerPerson}/day (€${budget} total ÷ ${numTravelers} traveler(s) ÷ ${days} days). Using the search results above, give a direct one-sentence verdict: is this tight, comfortable, or generous for ${destination}? Back it up with one real number from the searches. If the budget is fine, say it is fine — do not hedge. Only raise concern if the arithmetic genuinely breaks.

## Book today
Items to book NOW — flights, transit passes, popular reservations.

## Budget breakdown
Show per-person costs: lodging, food, transit, activities, buffer — all in real numbers from the search results. Then show the total and compare to €${budget}. If over budget, flag "OVER BUDGET BY €X" and suggest specific cuts. If under budget, show the surplus and call it a comfortable trip.

## Getting there
From ${origin} → ${destination}. Use flight prices from the searches. Cheapest day, cheapest airline. Airport-to-city transfer with exact transit info.

## Where to stay
3 NAMED options at different price points using the accommodation search results. Skip if user mentions staying with friends.

## Local transit
Exact pass for this trip length using prices from the transit search. Where to buy. Validation rules. Fine for not validating. Plus 2-3 sentences on how the system works.

## Day-by-day plan
Day 1 = arrival, last day = departure. For each day, 4-6 stops with: time, place + neighborhood + nearest transit stop, real price, 1-line honest assessment, watch-outs.

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

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const finalStream = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            stream: true,
            max_tokens: 6500,
          });

          for await (const chunk of finalStream) {
            const text = chunk.choices[0]?.delta?.content || "";
            if (text) controller.enqueue(encoder.encode(text));
          }
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Stream error";
          controller.enqueue(encoder.encode(`\n\n[Error: ${message}]`));
          controller.close();
        }
      },
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