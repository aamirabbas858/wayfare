import type { MetadataRoute } from "next";

// Only the landing page and the planner are public. Everything else is either
// an account surface or someone's saved trip, and none of it should be in an
// index — the per-page metadata says the same thing, this is the crawl-level
// half of it.
const PRIVATE = [
  "/api/",
  "/dashboard",
  "/trips/",
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

export default function robots(): MetadataRoute.Robots {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://wayfare-xi.vercel.app";

  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE },
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
