/**
 * Run: npx tsx lib/itinerary.test.ts
 *
 * The case that mattered: a saved trip rendered its map-data array as visible
 * text under a "Map data" heading, because only the live planner cut it off.
 * Every assertion about `prose` here is really asserting that nothing
 * JSON-shaped survives to the page.
 */
import assert from "node:assert";
import { splitMapData } from "./itinerary";

const TRIP = `## The Essentials
Barcelona rewards early booking.

## Local transit
- T-Casual, €12.55 for 10 rides

## Map data
\`\`\`json
[
  {"name": "In & Out Hostel", "address": "C/ de Girona 24", "lat": 41.39, "lng": 2.17, "day": 1, "type": "hotel"},
  {"name": "La Boqueria Market", "address": "La Rambla 91", "lat": 41.38, "lng": 2.17, "day": 2, "type": "market"},
  {"name": "Broken", "lat": "not-a-number", "lng": 2.17}
]
\`\`\``;

const { prose, places } = splitMapData(TRIP);

/* ── the bug ────────────────────────────────────────────────────────── */
assert.ok(!prose.includes("Map data"), "map heading leaked into the page");
assert.ok(!prose.includes('"lat"'), "raw JSON leaked into the page");
assert.ok(!prose.includes("```"), "code fence leaked into the page");

/* ── the prose survives intact ──────────────────────────────────────── */
assert.match(prose, /## The Essentials/);
assert.match(prose, /T-Casual, €12,?\.?55 for 10 rides/);
assert.ok(prose.trimEnd() === prose, "trailing whitespace not trimmed");

/* ── places are usable, bad rows dropped ────────────────────────────── */
assert.strictEqual(places.length, 2, "should drop the row with a bad lat");
assert.strictEqual(places[0].name, "In & Out Hostel");
assert.strictEqual(places[1].day, 2);

// day drives marker colour, so a missing one must not reach the map as
// undefined — it falls back to 1 rather than losing the pin entirely.
const noDay = splitMapData('## X\nY\n\n[{"name":"Q","lat":41.3,"lng":2.1}]');
assert.strictEqual(noDay.places[0].day, 1, "missing day should default to 1");

/* ── the model is inconsistent about how it ends; all forms must cut ── */
const bare = splitMapData(`## Essentials\nText.\n\n[{"name":"X","lat":41.3,"lng":2.1}]`);
assert.ok(!bare.prose.includes('"lat"'), "bare array leaked");
assert.strictEqual(bare.places.length, 1);

const fenceOnly = splitMapData('## Essentials\nText.\n\n```json\n[{"name":"Y","lat":1,"lng":2}]\n```');
assert.ok(!fenceOnly.prose.includes("```"), "fence-only form leaked");
assert.strictEqual(fenceOnly.places.length, 1);

/* ── mid-stream and degenerate input must not throw ─────────────────── */
const partial = splitMapData('## Essentials\nText.\n\n```json\n[{"name":"Z","la');
assert.ok(!partial.prose.includes("```"), "partial fence leaked");
assert.deepStrictEqual(partial.places, [], "unparseable JSON yields no places");

assert.deepStrictEqual(splitMapData(""), { prose: "", places: [] });
assert.deepStrictEqual(splitMapData("   "), { prose: "", places: [] });

/* ── a trip with no map data is returned whole ──────────────────────── */
const plain = splitMapData("## Essentials\nJust prose, no places.");
assert.strictEqual(plain.prose, "## Essentials\nJust prose, no places.");
assert.deepStrictEqual(plain.places, []);

console.log("itinerary: all checks passed");
