"use client";

import { useEffect, useRef } from "react";
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

const dayColors = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#a855f7", "#ec4899",
];

export default function TripMap({ places }: { places: Place[] }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current || places.length === 0) return;

    const validPlaces = places.filter(
      (p) => typeof p.lat === "number" && typeof p.lng === "number"
    );
    if (validPlaces.length === 0) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [validPlaces[0].lng, validPlaces[0].lat],
      zoom: 12,
    });

    mapRef.current = map;

    const bounds = new mapboxgl.LngLatBounds();

    validPlaces.forEach((place) => {
      const color = dayColors[(place.day - 1) % dayColors.length];

      const el = document.createElement("div");
      el.style.cssText = `
        width: 22px; height: 22px;
        background-color: ${color};
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 6px rgba(0,0,0,0.5);
        cursor: pointer;
      `;

      new mapboxgl.Marker(el)
        .setLngLat([place.lng, place.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(
            `<div style="color: #111; font-family: system-ui; padding: 4px;">
              <strong style="font-size: 14px;">${place.name}</strong><br/>
              <span style="font-size: 12px; color: #666;">Day ${place.day}${place.type ? ` · ${place.type}` : ""}</span>
            </div>`
          )
        )
        .addTo(map);

      bounds.extend([place.lng, place.lat]);
    });

    if (validPlaces.length > 1) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
    }

    return () => {
      map.remove();
    };
  }, [places]);

  if (places.length === 0) return null;

  return (
    <div className="mb-10">
      <div
        ref={mapContainer}
        className="w-full h-[400px] rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800"
      />
      <div className="flex flex-wrap gap-3 mt-3 text-xs text-neutral-500">
        {Array.from(new Set(places.map((p) => p.day)))
          .sort((a, b) => a - b)
          .map((day) => (
            <div key={day} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: dayColors[(day - 1) % dayColors.length] }}
              />
              Day {day}
            </div>
          ))}
      </div>
    </div>
  );
}