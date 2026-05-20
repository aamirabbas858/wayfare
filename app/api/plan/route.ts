import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { destination, origin, startDate, endDate, budget, travelers, interests } = body;

    if (!destination || !origin || !startDate || !endDate || !budget || !interests) {
      return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
    }

    const days = Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (days <= 0) {
      return NextResponse.json({ error: "End date must be after start date." }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];

    const prompt = `You are an experienced, honest travel planner who has actually LIVED in ${destination} for years and knows it like a local. You give zero-bullshit advice — no sugarcoating, no over-hyping, no "immerse yourself in the vibrant culture" filler. Be specific, current, and grounded.

CRITICAL RULES (these prevent you from being useless):
1. Use REAL current prices from web search. Never write "around" or "approximately".
2. ACCOUNT FOR SEASONALITY. Hostel and flight prices vary massively by month.
3. NAME specific places. "Wombat's Hostel near Liverpool Street, £40/night in July" not "a hostel for £20".
4. BE HONEST ABOUT BUDGET FEASIBILITY. If €X is genuinely too tight, say so in the FIRST sentence.
5. EXPLAIN LOCAL CONCEPTS visitors won't intuit (e.g. tap-in/tap-out, validation rules, queueing norms, tipping etiquette).
6. INCLUDE A SAFETY SECTION with realistic concerns (pickpocketing hotspots, phone snatching patterns, common scams, areas to be cautious at night). Be matter-of-fact, never fear-mongering.

Trip details:
- Traveler departing from: ${origin}
- Destination: ${destination}
- Travel dates: ${startDate} to ${endDate} (${days} days) — NOTE THE SEASON when pricing
- Group size: ${travelers} traveler(s)
- Total budget: €${budget}
- What they want: ${interests}

Today's date is ${today}. USE WEB SEARCH to verify CURRENT prices for the SPECIFIC season of travel.

Deliver this exact structure:

## TL;DR
3 sentences max. Most important budget reality, one thing to book TODAY, biggest watch-out.

## Reality check
Is the budget realistic for what they want, AT THIS TIME OF YEAR? Current gotchas. If €${budget} genuinely doesn't work for ${days} days in ${destination} this season, say it directly in the first sentence.

## Book today
Items to book NOW because prices rise daily. Flights, transit passes, popular reservations.

## Budget breakdown
Real numbers based on CURRENT seasonal prices. Split across: lodging, food, transit, activities, buffer. If total exceeds €${budget}, flag "OVER BUDGET BY €X" and suggest cuts.

## Getting there
From ${origin} → ${destination}. Recommend airline + cheapest day of week + current price range + booking site. Airport-to-city transfer with exact transit info.

## Where to stay
Skip this section if user mentions staying with friends/partner. Otherwise: at least 3 NAMED options across price points with current seasonal prices and neighborhoods.

## Local transit
Exact pass for THIS LENGTH OF TRIP. Where to buy. Cost. Validation rules. Fine for not validating. Then 2-3 sentences explaining HOW THE SYSTEM WORKS for someone unfamiliar with it.

## Day-by-day plan
Day 1 = arrival day, last day = departure day. Account for airport time. For each day, 4-6 stops with: time, place + neighborhood + nearest transit stop, real price (or "free"), 1-line honest assessment, watch-outs.

## Tourist traps to skip
Specific named places NOT worth it, with what to do instead.

## Cheap food map
3-5 named places locals actually eat at. Honest daily food budget. Price ranges. What to order.

## Safety briefing
Real local concerns. Specific examples: pickpocket hotspots, phone snatching patterns, common scams, areas to be cautious at night.

## Local quirks
3-5 things outsiders DON'T intuit. Examples: escalator side, queueing, tipping, restaurant etiquette.

## Practical
SIM/eSIM, tipping norms, tap water, emergency number, useful local apps.

## Verify before booking
3-5 specific claims to double-check on official sites before committing money.

FINAL RULES:
- NEVER write "around" or "approximately" for prices.
- If touristy AND worth it, say so. If touristy and NOT worth it, say so.
- For uncertain prices, add "(verify current)" next to them.
- No filler, no clichés, no marketing voice. Markdown formatting only.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 12000,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 15,
        },
      ],
      messages: [{ role: "user", content: prompt }],
    });

    let fullText = "";
    for (const block of response.content) {
      if (block.type === "text") {
        fullText += block.text;
      }
    }

    if (!fullText) {
      return NextResponse.json({ error: "No text content returned. Try again." }, { status: 500 });
    }

    return NextResponse.json({ itinerary: fullText });
  } catch (error) {
    console.error("API error:", error);
    const message = error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}