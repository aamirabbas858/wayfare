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
  const json = fenced?.[1] ?? bare?.[1];

  let places: Place[] = [];
  if (json) {
    try {
      const p: unknown = JSON.parse(json);
      if (Array.isArray(p)) {
        places = p
          .filter(
            (x) =>
              !!x && Number.isFinite(Number(x.lat)) && Number.isFinite(Number(x.lng))
          )
          // `day` drives the marker colour and the legend. A place that
          // arrives without one used to pass through as undefined and break
          // colouring quietly; it falls back to day 1 instead, because
          // dropping a place the itinerary names is the worse failure.
          .map((x) => ({
            ...x,
            lat: Number(x.lat),
            lng: Number(x.lng),
            day: Number.isFinite(Number(x.day)) ? Number(x.day) : 1,
          }));
      }
    } catch {
      /* Still streaming, or the model produced invalid JSON. The prose is the
         product and the map is an enhancement, so failing here is quiet. */
    }
  }

  return { prose, places };
}
