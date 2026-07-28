/**
 * Splits the trailing map-data JSON off an itinerary.
 *
 * The model ends every trip with a JSON array of named places so the map can
 * pin them. It is data, not prose, and must never reach the page as text.
 *
 * This lived inline in the live planner, which meant saved trips — rendered
 * by a different component — never got it, and displayed the raw array under
 * a "Map data" heading. Extracted here so both paths cut in the same place:
 * a second copy of this logic is how the two drifted apart to begin with.
 */

import type { Place } from "@/components/TripMap";

export interface SplitItinerary {
  /** Everything before the map data — the part that renders. */
  prose: string;
  /** Places with usable coordinates. Empty when absent or malformed. */
  places: Place[];
}

export function splitMapData(markdown: string): SplitItinerary {
  if (!markdown?.trim()) return { prose: "", places: [] };

  // Whichever marker appears first wins. The model is inconsistent about
  // whether it writes the heading, the fence, or drops a bare array in, and
  // during streaming only part of it may have arrived yet.
  const cuts = [
    markdown.indexOf("```json"),
    markdown.search(/##\s*Map\s+[Dd]ata/),
    markdown.search(/\n\[\s*\{[^[]*"lat"/),
  ].filter((i) => i > 0);

  const cut = cuts.length ? Math.min(...cuts) : markdown.length;
  const prose = markdown.slice(0, cut).trim();
  const tail = markdown.slice(cut);

  const fenced = tail.match(/```json\s*([\s\S]+?)```/);
  const bare = tail.match(/(\[\s*\{[\s\S]*"lat"[\s\S]*\}\s*\])/);
  // Neither pattern matches a half-written array, so fall back to whatever
  // follows the opening bracket and let the object scan below salvage it.
  const json = fenced?.[1] ?? bare?.[1] ?? tail.slice(tail.indexOf("["));

  return { prose, places: readPlaces(json) };
}

/**
 * Reads places out of a JSON array that may not be complete.
 *
 * A 12-day itinerary lists enough places that the closing pass can run out of
 * completion budget part-way through the array, leaving it ending on
 * `{"name":`. `JSON.parse` rejects the whole thing, and the result was a long
 * trip silently getting no map at all — every pin lost because the last one
 * was cut in half.
 *
 * So the array is parsed whole when it can be, and scanned object by object
 * when it cannot. Twenty-nine complete places and one truncated one should
 * yield twenty-nine pins.
 */
function readPlaces(json: string): Place[] {
  if (!json?.trim()) return [];

  let raw: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (Array.isArray(parsed)) raw = parsed;
  } catch {
    // Depth-aware scan: addresses contain commas and braces do not nest here,
    // but a naive split on "}," would still break on escaped quotes.
    for (const m of json.matchAll(/\{[^{}]*\}/g)) {
      try {
        raw.push(JSON.parse(m[0]));
      } catch {
        /* one malformed entry should not cost the others */
      }
    }
  }

  const seen = new Set<string>();
  const out: Place[] = [];

  for (const x of raw) {
    const p = x as Record<string, unknown>;
    const lat = Number(p?.lat);
    const lng = Number(p?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const name = String(p.name ?? "").trim();
    if (!name) continue;

    // The model repeats a place when it appears on more than one day. Two
    // markers at identical coordinates just stack on the map.
    const key = `${name.toLowerCase()}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      name,
      address: typeof p.address === "string" ? p.address : undefined,
      lat,
      lng,
      // `day` drives the marker colour and the legend. A place that arrives
      // without one used to pass through as undefined and break colouring
      // quietly; it falls back to day 1 instead, because dropping a place the
      // itinerary names is the worse failure.
      day: Number.isFinite(Number(p.day)) ? Number(p.day) : 1,
      type: typeof p.type === "string" ? p.type : undefined,
    });
  }

  return out;
}
