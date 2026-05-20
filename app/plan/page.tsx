"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function PlanPage() {
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
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-black dark:text-white mb-3">
            Plan your trip
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Tell us what you want. We&apos;ll handle the rest.
          </p>
        </div>

        <form className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label htmlFor="destination">Destination</Label>
              <Input id="destination" name="destination" placeholder="Tokyo, Japan" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="origin">Departing from</Label>
              <Input id="origin" name="origin" placeholder="Berlin, Germany" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" name="startDate" type="date" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" name="endDate" type="date" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget">Total budget (EUR)</Label>
              <Input id="budget" name="budget" type="number" min="50" step="50" placeholder="500" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="travelers">Travelers</Label>
              <Input id="travelers" name="travelers" type="number" min="1" step="1" placeholder="1" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="interests">What do you actually want to do?</Label>
            <Textarea
              id="interests"
              name="interests"
              rows={4}
              placeholder="cafes, electronic music, history museums, vegetarian food, walking neighborhoods, avoiding tourist traps"
            />
          </div>

          <div className="pt-2">
            <Button type="submit" size="lg" className="rounded-full px-7 w-full md:w-auto group">
              Plan my trip
              <span className="ml-2 transition-transform group-hover:translate-x-0.5">→</span>
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}