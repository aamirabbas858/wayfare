"use client";

import { useMemo, useState } from "react";
import TripMap, { DayLegend, type Place } from "@/components/TripMap";
import {
  ItinerarySection,
  SectionRail,
  parseSections,
} from "@/components/Itinerary";
import { useActiveSection } from "@/lib/hooks";
import { reconcileBudget } from "@/lib/budget";
import { splitMapData } from "@/lib/itinerary";

/**
 * Renders a stored itinerary using exactly the same components as the live
 * planner. Markdown is parsed at read time rather than at save time, so
 * changing how sections are laid out improves every trip already saved
 * instead of leaving old ones frozen in the old format.
 */
export default function SavedTrip({
  markdown,
  places,
  budget,
  currency,
}: {
  markdown: string;
  places: Place[];
  budget: number;
  currency: string;
}) {
  const [activeDay, setActiveDay] = useState<number | null>(null);

  // Markdown is stored verbatim, so the trailing map-data JSON is still in it
  // and has to be cut off here exactly as the live planner does — leaving it
  // in rendered the raw array on the page under a "Map data" heading.
  //
  // Totals are recomputed rather than trusted from the stored text, so trips
  // saved before the arithmetic was fixed are corrected on the way to the
  // screen instead of keeping a wrong total forever.
  const sections = useMemo(
    () =>
      parseSections(
        reconcileBudget(splitMapData(markdown).prose, budget, currency)
      ),
    [markdown, budget, currency]
  );
  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const active = useActiveSection(sectionIds);

  return (
    <div className="grid gap-10 xl:grid-cols-[190px_minmax(0,1fr)_400px]">
      <aside className="hidden xl:block">
        <div className="sticky top-24">
          <SectionRail sections={sections} active={active} />
        </div>
      </aside>

      <article className="min-w-0 space-y-12">
        {sections.map((s) => (
          <ItinerarySection key={s.id} section={s} />
        ))}
      </article>

      <aside className="order-first xl:order-none">
        <div className="sticky top-24 space-y-3">
          {places.length > 0 && (
            <>
              <TripMap
                places={places}
                activeDay={activeDay}
                className="h-[300px] xl:h-[calc(100vh-13rem)]"
              />
              <DayLegend
                places={places}
                activeDay={activeDay}
                onSelect={setActiveDay}
              />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
