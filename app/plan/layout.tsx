import type { Metadata } from "next";

// page.tsx is a client component, and client components cannot export metadata,
// so /plan was inheriting the homepage title verbatim. A server layout is the
// supported way to give it its own.
export const metadata: Metadata = {
  title: "Plan a trip",
  description:
    "Tell Wayfare where you are going and what you can spend. It researches live prices and writes a day-by-day itinerary with real costs, named places, and the things worth skipping.",
  alternates: { canonical: "/plan" },
  openGraph: {
    title: "Plan a trip · Wayfare",
    description:
      "Live prices, named places, and a day-by-day itinerary that tells you what a trip actually costs.",
    url: "/plan",
  },
};

export default function PlanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
