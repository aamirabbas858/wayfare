"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import TripMap, { type Place } from "@/components/TripMap";

export default function PlanPage() {
  const [loading, setLoading] = useState(false);
  const [itinerary, setItinerary] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const { places, cleanedItinerary } = useMemo<{
    places: Place[];
    cleanedItinerary: string;
  }>(() => {
    if (!itinerary) {
      return { places: [], cleanedItinerary: itinerary };
    }

    const markerPositions = [
      itinerary.indexOf("```json"),
      itinerary.search(/##\s*Map\s+[Dd]ata/),
      itinerary.search(/\n\[\s*\{[^[]*"lat"/),
    ].filter((i) => i > 0);

    const cutPoint =
      markerPositions.length > 0 ? Math.min(...markerPositions) : itinerary.length;

    const cleaned = itinerary.substring(0, cutPoint).trim();
    const remainder = itinerary.substring(cutPoint);

    let parsedPlaces: Place[] = [];
    const fencedMatch = remainder.match(/```json\s*([\s\S]+?)```/);
    const rawMatch = remainder.match(/(\[\s*\{[\s\S]*"lat"[\s\S]*\}\s*\])/);
    const jsonStr = fencedMatch?.[1] || rawMatch?.[1];

    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) parsedPlaces = parsed;
      } catch {}
    }

    return { places: parsedPlaces, cleanedItinerary: cleaned };
  }, [itinerary]);

  // DEBUG LOGGING — remove later
  useEffect(() => {
    if (itinerary && !loading) {
      console.log("=== RAW ITINERARY (last 2000 chars) ===");
      console.log(itinerary.slice(-2000));
      console.log("=== PLACES PARSED ===", places);
    }
  }, [itinerary, loading, places]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setItinerary("");

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error || "Failed to plan trip");
        } catch {
          throw new Error(errorText || "Failed to plan trip");
        }
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setItinerary(accumulated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const showForm = !itinerary && !loading;
  const showSpinner = loading && !itinerary;
  const showResults = itinerary.length > 0;

  return (
    <main className="min-h-screen bg-white dark:bg-black">
      <header className="px-6 py-6 border-b border-neutral-200 dark:border-neutral-900">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-black dark:bg-white flex items-center justify-center">
              <span className="text-white dark:text-black text-xs font-medium">w</span>
            </div>
            <span className="text-sm font-medium tracking-tight text-neutral-600 dark:text-neutral-400">
              wayfare
            </span>
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-12">
        {showForm && (
          <>
            <div className="mb-10">
              <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-black dark:text-white mb-3">
                Plan your trip
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400">
                Tell us what you want. We&apos;ll handle the rest.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="destination">Destination</Label>
                  <Input id="destination" name="destination" placeholder="Tokyo, Japan" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="origin">Departing from</Label>
                  <Input id="origin" name="origin" placeholder="Berlin, Germany" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start date</Label>
                  <Input id="startDate" name="startDate" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End date</Label>
                  <Input id="endDate" name="endDate" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget">Total budget (EUR)</Label>
                  <Input id="budget" name="budget" type="number" min="50" step="50" placeholder="500" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="travelers">Travelers</Label>
                  <Input id="travelers" name="travelers" type="number" min="1" step="1" defaultValue="1" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="interests">What do you actually want to do?</Label>
                <Textarea
                  id="interests"
                  name="interests"
                  rows={4}
                  placeholder="cafes, electronic music, history museums, vegetarian food, walking neighborhoods, avoiding tourist traps"
                  required
                />
              </div>

              <div className="pt-2">
                <Button type="submit" size="lg" className="rounded-full px-7 w-full md:w-auto group">
                  Plan my trip
                  <span className="ml-2 transition-transform group-hover:translate-x-0.5">→</span>
                </Button>
              </div>

              {error && (
                <div className="text-sm text-red-600 dark:text-red-400 mt-4">{error}</div>
              )}
            </form>
          </>
        )}

        {showSpinner && (
          <div className="py-20 text-center">
            <div className="inline-block w-8 h-8 border-2 border-neutral-300 dark:border-neutral-700 border-t-black dark:border-t-white rounded-full animate-spin mb-6"></div>
            <p className="text-neutral-600 dark:text-neutral-400 mb-2">
              Researching real prices and conditions…
            </p>
            <p className="text-xs text-neutral-500">First response in a few seconds.</p>
          </div>
        )}

        {showResults && (
          <>
            <div className="mb-8 flex items-center justify-between">
              <Button
                onClick={() => {
                  setItinerary("");
                  setError(null);
                }}
                variant="outline"
                className="rounded-full"
                disabled={loading}
              >
                ← Plan another trip
              </Button>
              {loading && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <div className="w-3 h-3 border-[1.5px] border-neutral-400 border-t-transparent rounded-full animate-spin"></div>
                  Generating…
                </div>
              )}
            </div>

            <TripMap places={places} />

            <article>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h2: ({ children }) => (
                    <h2 className="text-2xl font-medium mt-10 mb-4 text-black dark:text-white">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-lg font-medium mt-6 mb-2 text-black dark:text-white">{children}</h3>
                  ),
                  p: ({ children }) => (
                    <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">{children}</p>
                  ),
                  ul: ({ children }) => <ul className="list-disc pl-6 space-y-1 mb-4 text-neutral-700 dark:text-neutral-300">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-6 space-y-1 mb-4 text-neutral-700 dark:text-neutral-300">{children}</ol>,
                  strong: ({ children }) => <strong className="font-medium text-black dark:text-white">{children}</strong>,
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-6">
                      <table className="w-full text-sm border-collapse">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="text-left font-medium py-2 px-3 border-b border-neutral-300 dark:border-neutral-700 text-black dark:text-white">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="py-2 px-3 border-b border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300">{children}</td>
                  ),
                  hr: () => <hr className="my-8 border-neutral-200 dark:border-neutral-800" />,
                }}
              >
                {cleanedItinerary}
              </ReactMarkdown>
            </article>
          </>
        )}
      </div>
    </main>
  );
}