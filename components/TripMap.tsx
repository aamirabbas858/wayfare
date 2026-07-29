"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

export interface Place {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  day: number;
  type?: string;
}

// Matches --color-day-* in globals.css. Kept in JS because Mapbox markers are
// created imperatively and never see the stylesheet's custom properties.
const DAY_COLORS = [
  "#E4572E", "#E8A33D", "#4E8F73", "#3E8EA8",
  "#6C6BAF", "#B85C8A", "#C4762E", "#3F8F8A",
];

export const dayColor = (day: number) =>
  DAY_COLORS[(Math.max(1, Math.floor(day || 1)) - 1) % DAY_COLORS.length];

export default function TripMap({
  places,
  activeDay = null,
  className = "",
}: {
  places: Place[];
  activeDay?: number | null;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  // Kept alongside the day so highlighting can restyle a marker in place
  // rather than tearing the whole set down and rebuilding it.
  const markers = useRef<{ marker: mapboxgl.Marker; el: HTMLElement; day: number }[]>([]);
  const [ready, setReady] = useState(false);

  // Memoised on the place list itself. Filtering inline produced a new array
  // identity on every render, which made the marker effect's dependencies
  // churn and stopped highlight changes from being applied reliably.
  const valid = useMemo(
    () => places.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    [places]
  );

  /* Create the map once, then reuse it. Rebuilding on every render would
     reset zoom and pan, which is infuriating while reading. */
  useEffect(() => {
    if (!container.current || map.current || valid.length === 0) return;

    const dark = document.documentElement.classList.contains("dark");
    const m = new mapboxgl.Map({
      container: container.current,
      style: dark
        ? "mapbox://styles/mapbox/dark-v11"
        : "mapbox://styles/mapbox/light-v11",
      center: [valid[0].lng, valid[0].lat],
      zoom: 11.5,
      attributionControl: false,
      cooperativeGestures: true, // page scroll wins unless the user opts in
    });

    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    m.on("load", () => setReady(true));
    map.current = m;

    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid.length]);

  /* Markers are built only when the place list changes. Highlighting is a
     separate effect that restyles them, so selecting a day never destroys and
     recreates DOM — which is both cheaper and avoids the popup closing. */
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    markers.current.forEach(({ marker }) => marker.remove());
    markers.current = [];

    valid.forEach((place) => {
      const day = Math.max(1, Math.floor(place.day || 1));
      const color = dayColor(day);

      const el = document.createElement("div");
      el.className = "wf-marker";
      el.style.cssText = `
        width: 20px; height: 20px; border-radius: 50%;
        background: ${color};
        border: 2.5px solid var(--surface-raised, #fff);
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        cursor: pointer;
        transition: opacity .25s ease, filter .25s ease;
      `;
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", `${place.name}, day ${day}`);

      /* Popup content is built as DOM nodes, never an HTML string.
         place.name originates from model output that is influenced by live
         web-search results, so setHTML() here would be an injection sink
         reachable by anyone who can rank a page for a destination query. */
      const popup = document.createElement("div");
      popup.style.cssText = "padding:2px 1px;min-width:130px;";

      const title = document.createElement("div");
      title.style.cssText =
        "font-weight:600;font-size:13px;line-height:1.3;margin-bottom:3px;";
      title.textContent = String(place.name ?? "Unnamed place");

      const meta = document.createElement("div");
      meta.style.cssText = "font-size:11px;opacity:.65;";
      meta.textContent = `Day ${day}${place.type ? ` · ${place.type}` : ""}`;

      popup.append(title, meta);
      if (place.address) {
        const addr = document.createElement("div");
        addr.style.cssText = "font-size:11px;opacity:.5;margin-top:3px;";
        addr.textContent = String(place.address);
        popup.append(addr);
      }

      const marker = new mapboxgl.Marker(el)
        .setLngLat([place.lng, place.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 22, closeButton: false }).setDOMContent(popup)
        )
        .addTo(m);

      markers.current.push({ marker, el, day });
    });
  }, [valid, ready]);

  /* Highlighting. Writes directly to each marker element, so a day selection
     is a style change rather than a teardown. Scaling is done with a filter
     rather than a transform, because Mapbox owns the element's transform for
     positioning and overwriting it would fling markers off the map. */
  useEffect(() => {
    if (!ready) return;

    for (const { el, day } of markers.current) {
      const dimmed = activeDay !== null && day !== activeDay;
      // Mapbox owns these elements and rewrites their transform on every
      // frame. Highlighting has to be written straight to the node — going
      // through React would fight the map for control of the same style
      // attribute, which is why opacity and filter are used and transform is
      // not touched.
      // eslint-disable-next-line react-hooks/immutability
      el.style.opacity = dimmed ? "0.25" : "1";
      el.style.filter = dimmed ? "grayscale(0.6)" : "none";
      el.style.zIndex = dimmed ? "0" : "1";
    }

    // Reframe to whatever is highlighted, so picking a day actually takes you
    // there rather than leaving you looking at the whole city.
    const m = map.current;
    if (!m) return;

    const shown = valid.filter(
      (p) =>
        activeDay === null ||
        Math.max(1, Math.floor(p.day || 1)) === activeDay
    );
    if (!shown.length) return;

    const bounds = new mapboxgl.LngLatBounds();
    shown.forEach((p) => bounds.extend([p.lng, p.lat]));
    if (!bounds.isEmpty()) {
      m.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 50, right: 50 },
        maxZoom: 14.5,
        duration: 700,
      });
    }
  }, [activeDay, valid, ready]);

  /* Follow the site theme without tearing down the map instance. */
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains("dark");
      m.setStyle(
        dark
          ? "mapbox://styles/mapbox/dark-v11"
          : "mapbox://styles/mapbox/light-v11"
      );
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  if (valid.length === 0) return null;

  return (
    <div className={`relative overflow-hidden rounded-xl border border-hairline ${className}`}>
      <div ref={container} className="h-full w-full" />
      {!ready && <div className="skeleton absolute inset-0" aria-hidden />}
    </div>
  );
}

/** Legend + day filter. Clicking a day isolates it on the map. */
export function DayLegend({
  places,
  activeDay,
  onSelect,
}: {
  places: Place[];
  activeDay: number | null;
  onSelect: (day: number | null) => void;
}) {
  const days = Array.from(
    new Set(places.map((p) => Math.max(1, Math.floor(p.day || 1))))
  ).sort((a, b) => a - b);

  if (days.length < 2) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={activeDay === null}
        className={`rounded-full border px-3 py-1 text-[0.74rem] font-medium transition-colors
                    duration-200 ${
                      activeDay === null
                        ? "border-foreground bg-foreground text-background"
                        : "border-hairline text-faint hover:text-foreground"
                    }`}
      >
        All days
      </button>
      {days.map((d) => {
        const on = activeDay === d;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onSelect(on ? null : d)}
            aria-pressed={on}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1
                        text-[0.74rem] font-medium transition-colors duration-200 ${
                          on
                            ? "border-foreground bg-foreground text-background"
                            : "border-hairline text-faint hover:text-foreground"
                        }`}
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ background: dayColor(d) }}
            />
            Day {d}
          </button>
        );
      })}
    </div>
  );
}
