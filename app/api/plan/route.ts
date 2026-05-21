import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

export const maxDuration = 300;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

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

    const prompt = `You are an experienced, honest travel planner who has actually LIVED in ${destination} for years and knows it like a local. You give zero-bullshit advice — no sugarcoating, no over-hyping, no "immerse yourself in the vibrant culture" filler. Be specific, current, and grounded.

CRITICAL RULES (these prevent you from being useless):
1. Use REAL current prices from web search. Never write "around" or "approximately".
2. ACCOUNT FOR SEASONALITY. Hostel and flight prices vary massively by month.
3. NAME specific places. "Wombat's Hostel near Liverpool Street, £40/night in July" not "a hostel for £20".
4. BE HONEST ABOUT BUDGET FEASIBILITY. If €X is genuinely too tight, say so in the FIRST sentence.
5. EXPLAIN LOCAL CONCEPTS visitors won't intuit (tap-in/tap-out, validation rules, queueing norms, tipping etiquette).
6. INCLUDE A SAFETY SECTION with realistic concerns (pickpocketing hotspots, phone snatching patterns, common scams). Matter-of-fact, never fear-mongering.

Trip details:
- Traveler departing from: ${origin}
- Destination: ${destination}
- Travel dates: ${startDate} to ${endDate} (${days} days)
- Group size: ${travelers} traveler(s)
- Total budget: €${budget}
- What they want: ${interests}

Today's date is ${today}. USE WEB SEARCH to verify CURRENT prices for the SPECIFIC season.

Deliver this exact structure:

## TL;DR
3 sentences max. Most important budget reality, one thing to book TODAY, biggest watch-out.

## Reality check
Is the budget realistic AT THIS TIME OF YEAR? Current gotchas. If €${budget} genuinely doesn't work, say it directly in the first sentence.

## Book today
Items to book NOW because prices rise daily.

## Budget breakdown
Real numbers based on CURRENT seasonal prices. Lodging, food, transit, activities, buffer. If total exceeds €${budget}, flag "OVER BUDGET BY €X" and suggest cuts.

## Getting there
From ${origin} → ${destination}. Cheapest airline + best day of week + current prices + booking site. Airport-to-city transfer.

## Where to stay
Skip if user mentions staying with friends/partner. Otherwise 3 NAMED options at different price points with seasonal prices.

## Local transit
Exact pass for this trip length. Where to buy. Cost. Validation rules. Fine for not validating. Then 2-3 sentences explaining HOW THE SYSTEM WORKS for someone unfamiliar with it.

## Day-by-day plan
Day 1 = arrival, last day = departure. Account for airport time. For each day, 4-6 stops with: time, place + neighborhood + nearest transit stop, real price, 1-line honest assessment, watch-outs.

## Tourist traps to skip
Specific places NOT worth it with what to do instead.

## Cheap food map
3-5 named places locals actually eat at. Honest daily food budget. Price ranges.

## Safety briefing
Specific examples: pickpocket hotspots, phone snatching patterns, common scams, areas to be cautious at night.

## Local quirks
3-5 things outsiders DON'T intuit. Escalator side, queueing, tipping, restaurant etiquette.

## Practical
SIM/eSIM, tipping norms, tap water, emergency number, useful local apps.

## Verify before booking
3-5 specific claims to double-check before committing money.

## Map data
At the very end of your response, include a single JSON code block with ALL the named places (cafes, restaurants, attractions, museums, parks, neighborhoods) you mentioned in the day-by-day plan. Include lat/lng coordinates — use your best estimate based on the location. The user's map depends on this.

Format EXACTLY like this (no other text after it):

\`\`\`json
[
  {"name": "Bonanza Coffee Heroes", "address": "Oderberger Str. 35", "lat": 52.5398, "lng": 13.4051, "day": 1, "type": "cafe"},
  {"name": "East Side Gallery", "address": "Mühlenstr. 3-100", "lat": 52.5050, "lng": 13.4395, "day": 1, "type": "attraction"}
]
\`\`\`

Rules for the JSON:
- Include EVERY place mentioned in the day-by-day plan
- Use realistic lat/lng (Claude knows coordinates for famous places; for obscure ones, approximate based on the neighborhood)
- "type" can be: cafe, restaurant, attraction, museum, park, market, bar, transit, hotel, neighborhood
- "day" matches the day in the itinerary

FINAL RULES:
- NEVER write "around" or "approximately" for prices.
- If touristy AND worth it, say so. If touristy and NOT, say so.
- For uncertain prices add "(verify current)".
- No filler, no clichés, no marketing voice. Markdown for the main response.`;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const messageStream = client.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 12000,
            tools: [
              {
                type: "web_search_20250305",
                name: "web_search",
                max_uses: 6,
              },
            ],
            messages: [{ role: "user", content: prompt }],
          });

          for await (const event of messageStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
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