# Wayfare

[![CI](https://github.com/aamirabbas858/wayfare/actions/workflows/ci.yml/badge.svg)](https://github.com/aamirabbas858/wayfare/actions/workflows/ci.yml)

**A travel planner that tells you what a trip actually costs — including what to skip.**

Live: **https://wayfare-xi.vercel.app** · No account needed to use it.

---

## The idea

Every AI travel assistant gives you the same vague recommendations. Immerse
yourself in the local culture. Visit the popular landmarks. None of them can
tell you what a Navegante pass costs in Lisbon this month, or that Pink Street
after 22:00 is four bars of overpriced sangria and a queue.

I tried Wonderplan, Layla, Mindtrip and ChatGPT before building this. They all
do roughly the same thing: a pretty UI wrapped around generic LLM output.

Wayfare researches live prices before it writes anything, then produces an
itinerary that argues — named places, real fees, transit stops, and an honest
verdict on whether your budget works. When it doesn't, it says so and suggests
what to cut.

The system prompt bans hedging: no "around", no "approximately", no "immerse
yourself in the vibrant culture". If somewhere is touristy and not worth it,
it says so. The interface is built around that voice — a field guide, not a
travel brochure.

## What it does

- **Live pricing.** Four parallel searches — flights, transit passes,
  accommodation, attraction fees — so numbers come from this month rather than
  the model's training data.
- **Budget arithmetic you can check.** Per-person-per-day appears live as you
  type, before you wait a minute for generation. The itinerary then shows its
  working: cheapest viable day, line by line, against your total.
- **14 currencies.** Prices are converted into the one you chose rather than
  echoing whatever the source page happened to use.
- **A map that follows the plan.** Every named place is pinned and coloured by
  day. Selecting a day dims the rest and reframes the map, so you can see
  whether the plan is geographically sensible or has you crossing the city
  three times before lunch.
- **Optional accounts.** Save trips, with a dashboard of what you have planned.

## Engineering decisions worth defending

### Three LLM providers, because one is a single point of failure

This project migrated Claude → Groq → Gemini, and every migration happened
because a quota ran out mid-use. The cause was never the provider; it was
having exactly one.

`lib/llm.ts` tries each configured provider in turn, skipping any whose key
is absent. Adding redundancy is an environment variable, not a code change.

**Running in production today: Mistral, then NVIDIA NIM, then Groq.** The code
also supports OpenRouter and Gemini; neither is configured. Gemini was dropped
after its prepaid balance ran out — an empty balance does not refill the way a
daily allowance does, and leaving a dead provider in the chain costs a wasted
request on every trip.

The order is measured rather than assumed. Groq's free tier turned out to be
**100,000 tokens per day** — roughly eight itineraries shared between every
visitor — so it can no longer lead despite being the fastest. Mistral's free
tier is metered monthly and is around three orders of magnitude larger;
NVIDIA meters requests per minute with no published daily token cap. Providers
that can absorb a bad afternoon go first.

It also distinguishes the two things a `429` can mean. A per-minute limit
clears on its own and is worth waiting out; a depleted balance never does.
Production logs showed the earlier code asking Gemini's three models twice
each, on every pass, after Gemini had already replied that its balance was
empty. It now reads the wait time — from the header, or from Groq's prose
`try again in 31m14s` — and skips the whole provider when the wait is
unusable, since all its models draw on the same allowance.

Failover happens **only before the first token**. Once a provider starts
writing we stay with it: switching mid-document would splice half a Gemini
itinerary onto half a Llama one, which is worse than a short one.

It also self-corrects on `413`. Providers reject a request when prompt plus
completion exceeds their limit, and that threshold is neither documented nor
stable across tiers. Rather than pick a conservative constant and permanently
give up longer itineraries, it asks for the full budget and halves it on
rejection.

### An XSS hole that arrives by web search

Map popups were built with `setHTML()` interpolating place names — which come
from model output, which is shaped by live search results. The attack path:

```
attacker publishes a page ranking for "<city> attractions"
  → Tavily fetches it
  → its text enters the prompt
  → the model emits a crafted place name
  → markup executes in a visitor's browser
```

The attacker never contacts the victim. Popups are now assembled as DOM nodes
with `textContent`, so nothing is parsed as markup.

This is indirect prompt injection, and it is worth knowing that *any* app
feeding retrieved web content to a model and rendering the output has this
shape of problem.

### Ownership lives in the WHERE clause

Every query in `lib/db/queries.ts` takes a `userId` and filters on it. A
forgotten check becomes a missing argument the compiler catches, rather than
one account silently reading another's trips.

`getTrip` returns `undefined` for both "no such trip" and "not yours", and the
API answers 404 rather than 403 — 403 would confirm the id exists.

### Sign in with Google, or with a password

Two ways in, and they interact awkwardly enough to be worth writing down.

**Google** uses OAuth: Wayfare never sees a password. The browser goes to
Google, Google asks the user to approve, and returns a signed code that the
server exchanges for the account's email. Setting it up means registering the
app in Google Cloud Console, enabling the OAuth consent screen, and listing
exactly which URLs Google is allowed to return to:

```
https://wayfare-xi.vercel.app/api/auth/callback/google    production
http://localhost:3000/api/auth/callback/google            local
```

Those must match character for character — a trailing slash is a different
URL, and the failure is a `redirect_uri_mismatch` that names no useful cause.

**Email and password** is the fallback, hashed with bcrypt.

The awkward part is what happens when one person uses both. Signing up with
Google and later trying a password on the same address must not work — it
would let anyone who guesses an email claim a Google account. So a
credentials login against a Google-only account fails, and it fails *in the
same way and after the same delay* as a login against an address that does
not exist at all. See below.

One consequence worth knowing: **Credentials forces JWT sessions.** Auth.js
cannot store a database session for a credentials login, so once that provider
exists every session is a signed token rather than a database row — including
the Google ones.

### One canonical origin for OAuth

Vercel serves every deployment on two hosts: the production alias, and a
per-deploy URL like `wayfare-n4j18w3f7-….vercel.app`. With `trustHost: true`,
Auth.js builds the OAuth callback from whichever `Host` header arrived — so
Google sign-in worked on the alias and failed with `redirect_uri_mismatch` on
the deploy URL, because only the alias is registered with Google.

Registering them is not an option: Google rejects wildcard redirect URIs, and
a new deploy URL is minted on every push.

`AUTH_URL` pins the callback to one origin regardless of how the request
arrived. It went unnoticed for weeks because every test used the alias — the
bug only appears if you reach the app through the Vercel dashboard, which
links to the deployment rather than the alias.

### No account enumeration

- Credentials login compares against a dummy hash when the account is missing
  or Google-only, so response time does not reveal which emails are registered.
- Password reset answers identically whether or not the address exists,
  whether the account is OAuth-only, and whether the email actually sent.
- Only a **malformed** address is reported, since that is the sender's own
  typo rather than information about someone else.

### Reset tokens are stored hashed

Only a SHA-256 hash of each token is kept, so read access to the database does
not confer the ability to reset anyone's password — the same argument that
applies to hashing passwords. Tokens are single-use, expire in 30 minutes, and
a successful reset revokes every other outstanding token so a leaked older
link cannot be replayed.

### The planner never sits behind a login wall

Auth is optional by design. Anyone can plan a trip immediately; saving is the
upgrade. Signed out, the save control becomes a sign-in link carrying a
callback rather than a disabled button.

A missing `DATABASE_URL` disables accounts rather than throwing at import
time, so the planner keeps working even when the database does not.

### Checks run on every push

`npm test` covers the two places where correctness is not obvious from
reading the code: the budget arithmetic, and splitting map data off an
itinerary. Both suites are built from **real broken output** rather than
synthetic fixtures — the buffer double-count and the half-written JSON array
that cost a 12-day trip all of its map pins. A made-up fixture would not have
caught either.

CI runs typecheck, lint, tests and a production build with no secrets present.
That last part is deliberate: anything that cannot build without a key is a
route that would take the whole site down the day that key is missing, which
has already happened here once.

### Every dashboard figure is real

Trips planned, distinct destinations, planned spend, days to next departure —
all computed from saved trips. There is no weather tile, no flight status, no
booking widget, because there is no data behind them. Spend is grouped by
currency rather than summed, since adding PKR to EUR produces a number that
means nothing.

## How a request actually works

1. The form posts to `/api/plan`; inputs are bounded before anything else
   happens, so an oversized request cannot drive unbounded token spend.
2. Four targeted queries — flights, transit, accommodation, attractions — run
   in parallel through Tavily, and each result is clipped so prompt size stays
   predictable regardless of how verbose a page is.
3. Results are packaged into one prompt with strict formatting rules and sent
   to the first available provider with streaming enabled.
4. The response streams back and the frontend parses `## ` sections as they
   arrive, so the page fills in rather than waiting.
5. The model ends with a JSON block of every named place and its coordinates.
   The frontend splits that off, hides it, and renders the pins.

Saved trips store the markdown verbatim and re-parse it at read time, so
improving how sections render improves every trip already saved instead of
freezing old ones in an old format.

## Stack

Next.js 16 · TypeScript · Tailwind v4 · Neon Postgres + Drizzle ·
Auth.js v5 · Mistral / NVIDIA NIM / Groq · Tavily · Mapbox · Vercel

Motion is CSS and Canvas only — no animation library, which is ~40 kB for what
transforms already do at 60fps.

There is also an earlier Python + Streamlit prototype I used to validate the
prompt before building the real thing.

## Running it

```bash
git clone https://github.com/aamirabbas858/wayfare.git
cd wayfare && npm install
cp .env.example .env.local     # fill in your keys
npm run dev
```

Only two variables are needed to plan trips. Everything else is optional.

| Variable | Needed for |
|---|---|
| at least one of `MISTRAL_API_KEY`, `NVIDIA_API_KEY`, `GROQ_API_KEY` | generating itineraries |
| `TAVILY_API_KEY` | live price research |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | the map |
| `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | accounts and saving |
| `AUTH_URL` | **required in production** — see below |
| `AUTH_RESEND_KEY` | password reset emails |

Schema lives in `lib/db/schema.ts`; `npx drizzle-kit push` applies it.

## Known limits

- Prices are researched live and can move between generation and booking. Each
  itinerary ends with a list of claims worth verifying before paying.
- Free-tier models produce shorter itineraries than paid ones. The token
  budget adapts downward rather than failing, so length varies with whichever
  provider answered.
- Reset emails only reach the Resend account owner's address until a domain is
  verified.
- No rate limiting on `/api/plan`. Per-IP limits on serverless need a KV store,
  which is not wired up.

---

Built by [Abbas Aamir](https://www.linkedin.com/in/abbas-aamir-474969353/) — CS undergraduate in Berlin.
