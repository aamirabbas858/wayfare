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

/* ── truncated arrays must still yield the places that arrived ──────── */
// Taken from a real 12-day New York itinerary whose closing pass ran out of
// budget mid-array. JSON.parse rejects the whole thing, and the trip lost
// every pin — the failure this salvage path exists for.
const TRUNCATED = `## Map data

\`\`\`json
[
  {"name": "The Local NYC", "address": "13-02 44th Ave, Long Island City, NY 11101", "lat": 40.7475, "lng": -73.9458, "day": 1, "type": "hotel"},
  {"name": "Halal Guys", "address": "W 53rd St & 6th Ave, New York, NY 10019", "lat": 40.7615, "lng": -73.9797, "day": 1, "type": "restaurant"},
  {"name": "Museum of Modern Art (MoMA)", "address": "11 W 53rd St, New York, NY 10019", "lat": 40.7614, "lng": -73.9776, "day": 4, "type": "museum"},
  {"name": "Museum of Modern Art (MoMA)", "address": "11 W 53rd St, New York, NY 10019", "lat": 40.7614, "lng": -73.9776, "day": 4, "type": "museum"},
  {"name":`;

const salvaged = splitMapData(TRUNCATED);
assert.strictEqual(salvaged.places.length, 3, "should keep the complete entries and dedupe MoMA");
assert.strictEqual(salvaged.places[0].name, "The Local NYC");
assert.strictEqual(salvaged.places[2].day, 4);
assert.ok(!salvaged.prose.includes('"lat"'), "truncated JSON leaked into the page");
// Addresses contain commas — the scan must not split entries on them.
assert.strictEqual(salvaged.places[0].address, "13-02 44th Ave, Long Island City, NY 11101");

/* ── a trip with no map data is returned whole ──────────────────────── */
const plain = splitMapData("## Essentials\nJust prose, no places.");
assert.strictEqual(plain.prose, "## Essentials\nJust prose, no places.");
assert.deepStrictEqual(plain.places, []);

console.log("itinerary: all checks passed");
