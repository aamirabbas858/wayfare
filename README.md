# wayfare

A travel planner that gives honest, current advice instead of the generic stuff every other AI travel app spits out.

**Live demo:** https://wayfare-xi.vercel.app

## The idea

I got annoyed with how every AI travel assistant gives you the same vague recommendations. ChatGPT tells you to "immerse yourself in the local culture" and visit "popular landmarks." It can't tell you what an Oyster card actually costs in London right now, or that the Pergamon Museum in Berlin is half-closed for renovation, or that you'll get your phone snatched if you stand on a Shoreditch curb with it out.

So I built wayfare. It uses Claude with web search to give you:

- Real current prices for flights, hostels, and transit (looked up live, not pulled from training data)
- Named restaurants and cafes with actual addresses, not "try some local food"
- Safety briefings with specific pickpocket hotspots
- Local quirks (which side of the escalator to stand on, exact tipping etiquette)
- Honest budget checks that say "this isn't realistic" when it isn't
- A map with day-color-coded pins so you can see where everything is

It's supposed to feel like advice from a friend who actually lives in the city you're visiting, not a chatbot quoting Wikipedia.

## Screenshots

> ![Landing page](./screenshots/landing.png)

![Generated itinerary](./screenshots/itinerary.png)

![Map with day-color-coded pins](./screenshots/map.png)

## What's actually different from other AI travel tools

I tried Wonderplan, Layla, Mindtrip, and ChatGPT before building this. They all do roughly the same thing: pretty UI wrapped around generic LLM output. Wayfare's differences:

**Web search is forced, not optional.** Every response runs up to 4 live searches to verify prices and conditions. The prompt explicitly bans the model from using vague words like "around" or "approximately" — it has to give real numbers or mark uncertain ones with "(verify current)".

**The prompt is hostile to AI clichés.** The system prompt has rules like "never write 'immerse yourself in the vibrant culture'" and "if a place is touristy and not worth it, say so." Most AI tools won't tell you something sucks. Mine will.

**Honest budget feasibility check.** If you say "€400 for 7 days in London," it tells you that doesn't work and shows what does. Generic AI tools pretend everything is doable.

**Map with day-color-coded pins.** Every place from the itinerary gets a Mapbox pin colored by which day you visit it. So you can see at a glance whether the plan is geographically sensible or has you crossing the city three times in one day.

**Safety briefing that's actually specific.** Not "be aware of your surroundings" — specific. "Moped phone snatchings happen on Shoreditch High Street, Old Street roundabout, and Bethnal Green Road. Don't stand on the curb with your phone out."

## Tech stack

- **Next.js 15** with App Router and TypeScript
- **Tailwind CSS** + **shadcn/ui** for the design system
- **Anthropic Claude API** (Sonnet 4.6) as the language model
- **Anthropic's web_search tool** for real-time data
- **Mapbox GL JS** for the map visualization
- **Streaming responses** via ReadableStream so output appears as it's generated
- **Vercel** for hosting, auto-deploys on every git push
- **GitHub** for version control

There's also an earlier Python + Streamlit prototype in a separate folder that I used to validate the prompt and the approach before building the proper Next.js version.

## How it actually works

When you submit the form:

1. The form posts to `/api/plan`, a Next.js API route
2. The API route builds a detailed prompt with your destination, dates, budget, and interests, plus a long list of rules forcing real prices and honest assessments
3. It calls Claude with the web_search tool enabled, capped at 4 searches per request
4. Claude decides what to search (transit prices, current hostel rates, opening hours, etc.) and runs those searches itself
5. The response streams back token by token via a ReadableStream
6. The frontend reads the stream and updates the page in real time
7. At the very end of the response, Claude outputs a JSON block listing every named place with lat/lng coordinates
8. The frontend parses that JSON, hides it from the visible text, and renders the places as colored pins on a Mapbox map

The whole thing runs on Vercel's serverless functions, which have a 60-second timeout on the free tier — handling that was actually one of the harder parts.

## Hard parts I had to figure out

**Vercel's 60-second timeout.** The first deployed version timed out constantly because Claude takes 30-60 seconds to do web searches before any text comes out. The fix was switching to streaming responses — Vercel keeps the function alive as long as data is flowing, even past 60 seconds.

**Stopping the LLM from leaking JSON into the visible output.** Claude is supposed to put the place-list JSON at the end in a code block, but it sometimes drops the code fences. I ended up writing a parser that finds the JSON by looking for the earliest marker among three options (a `## Map data` heading, a ```` ```json ```` fence, or a raw `[{...` array containing `"lat"`) and cuts everything from that point onward out of the display text.

**API key leaks.** Made the classic mistake early on of pasting my Anthropic key into the wrong file. Had to revoke and regenerate. Now I'm religious about `.env.local` and `.gitignore`.

**Cost management.** Each Claude call with web search costs around €0.15-0.25. Dropped max_uses from 6 to 4 to cut response time and cost without losing the critical searches.

**Map coordinates from an LLM.** Claude knows lat/lng for famous places but approximates for obscure ones. Some pins land a few hundred meters off the real spot. Mapbox geocoding would fix this but adds another API call per place — left it as-is for v1.

## Known limitations

Being honest about what's not great:

- Coordinates from Claude are sometimes slightly off for obscure venues
- No saved trips yet — refreshing the page loses your itinerary. localStorage for this is planned
- English only
- Response takes 60-90 seconds — cut down from 2+ minutes, but not instant. Anything faster means cutting web search depth
- Single user, no accounts. Trips aren't saved or shareable
- Currently runs on my personal Anthropic credits. Migration to Groq + Tavily (free LLM + free search) is the next big task so it can scale without my wallet bleeding

## What I actually learned building this

- How to structure a prompt for forcing specific output format (and how easily models ignore your rules if you're not strict)
- How streaming LLM responses work on serverless platforms and why they're necessary for anything that takes longer than a few seconds
- The difference between a working local demo and a deployable production app is almost entirely error handling and edge cases
- How Next.js App Router separates server and client code
- Why "just use the LLM output directly" doesn't work — you always need a parser
- How to debug bugs that only happen in production (the worst kind)
- API key hygiene the hard way

## Running it locally

You need:

- Node.js 20 or higher
- An Anthropic API key from [console.anthropic.com](https://console.anthropic.com)
- A Mapbox public token from [account.mapbox.com](https://account.mapbox.com) (free)

```bash
git clone https://github.com/aamirabbas858/wayfare.git
cd wayfare
npm install
```

Create `.env.local` in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...
```

Then:

```bash
npm run dev
```

Open `http://localhost:3000`.

## What's next

- Migrate from Anthropic to Groq (Llama 3.3 70B) + Tavily so the API is free
- localStorage to remember recent trips
- Custom domain
- Maybe a Supabase database for shareable, persistent trips
- Better mobile layout on the planner page

## About me

I'm a CS undergrad at BSBI Berlin, building this in the evenings around classes and a part-time bakery job. Trying to learn what it actually takes to ship something real, not just finish coursework.

Reach me: aamirabbas858@gmail.com
LinkedIn url: www.linkedin.com/in/abbas-aamir-474969353

