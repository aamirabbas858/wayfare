import { describe, expect, it } from "vitest";
import { splitMapData } from "./itinerary";

/**
 * The case that mattered: a saved trip rendered its map-data array as visible
 * text under a "Map data" heading, because only the live planner cut it off.
 * Every assertion about `prose` here is really asserting that nothing
 * JSON-shaped survives to the page.
 */
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

/**
 * From a real 12-day New York itinerary whose closing pass ran out of budget
 * mid-array. JSON.parse rejects a half-written array, so the trip lost every
 * pin — one truncated entry costing all twenty-nine complete ones.
 */
const TRUNCATED = `## Map data

\`\`\`json
[
  {"name": "The Local NYC", "address": "13-02 44th Ave, Long Island City, NY 11101", "lat": 40.7475, "lng": -73.9458, "day": 1, "type": "hotel"},
  {"name": "Halal Guys", "address": "W 53rd St & 6th Ave, New York, NY 10019", "lat": 40.7615, "lng": -73.9797, "day": 1, "type": "restaurant"},
  {"name": "Museum of Modern Art (MoMA)", "address": "11 W 53rd St, New York, NY 10019", "lat": 40.7614, "lng": -73.9776, "day": 4, "type": "museum"},
  {"name": "Museum of Modern Art (MoMA)", "address": "11 W 53rd St, New York, NY 10019", "lat": 40.7614, "lng": -73.9776, "day": 4, "type": "museum"},
  {"name":`;

describe("splitMapData", () => {
  describe("nothing JSON-shaped reaches the page", () => {
    const { prose } = splitMapData(TRIP);

    it("cuts the heading, the fence and the array", () => {
      expect(prose).not.toContain("Map data");
      expect(prose).not.toContain('"lat"');
      expect(prose).not.toContain("```");
    });

    it("keeps the prose intact", () => {
      expect(prose).toContain("## The Essentials");
      expect(prose).toContain("T-Casual");
      expect(prose.trimEnd()).toBe(prose);
    });
  });

  describe("the model is inconsistent about how it ends", () => {
    it("handles a fenced block", () => {
      const r = splitMapData('## Essentials\nText.\n\n```json\n[{"name":"Y","lat":1,"lng":2}]\n```');
      expect(r.prose).not.toContain("```");
      expect(r.places).toHaveLength(1);
    });

    it("handles a bare array with no fence", () => {
      const r = splitMapData('## Essentials\nText.\n\n[{"name":"X","lat":41.3,"lng":2.1}]');
      expect(r.prose).not.toContain('"lat"');
      expect(r.places).toHaveLength(1);
    });

    it("handles a half-streamed fence, which is most of a generation", () => {
      const r = splitMapData('## Essentials\nText.\n\n```json\n[{"name":"Z","la');
      expect(r.prose).not.toContain("```");
      expect(r.places).toEqual([]);
    });
  });

  describe("places", () => {
    it("drops rows without usable coordinates", () => {
      expect(splitMapData(TRIP).places).toHaveLength(2);
    });

    it("defaults a missing day to 1 rather than losing the pin", () => {
      // `day` drives marker colour. Undefined broke colouring silently, and
      // dropping a place the itinerary names is the worse failure.
      const r = splitMapData('## X\nY\n\n[{"name":"Q","lat":41.3,"lng":2.1}]');
      expect(r.places[0].day).toBe(1);
    });

    it("salvages complete entries from a truncated array", () => {
      const r = splitMapData(TRUNCATED);
      expect(r.places).toHaveLength(3); // 4 complete, one a duplicate
      expect(r.places[0].name).toBe("The Local NYC");
      expect(r.prose).not.toContain('"lat"');
    });

    it("keeps addresses containing commas whole", () => {
      // The scan matches whole {...} objects rather than splitting on "},",
      // which a naive implementation would get wrong here.
      const r = splitMapData(TRUNCATED);
      expect(r.places[0].address).toBe("13-02 44th Ave, Long Island City, NY 11101");
    });

    it("drops duplicates the model emits for multi-day places", () => {
      const r = splitMapData(TRUNCATED);
      const moma = r.places.filter((p) => p.name.includes("MoMA"));
      expect(moma).toHaveLength(1);
    });
  });

  it("returns a trip with no map data whole", () => {
    const plain = "## Essentials\nJust prose, no places.";
    expect(splitMapData(plain)).toEqual({ prose: plain, places: [] });
    expect(splitMapData("")).toEqual({ prose: "", places: [] });
  });
});
