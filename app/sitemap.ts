import type { MetadataRoute } from "next";

// Two public routes, so the sitemap is written out rather than generated. Saved
// trips are per-account and deliberately absent — they are noindex and would
// leak nothing but 404s to a crawler anyway.
export default function sitemap(): MetadataRoute.Sitemap {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://wayfare-xi.vercel.app";
  const lastModified = new Date();

  return [
    { url: site, lastModified, changeFrequency: "monthly", priority: 1 },
    {
      url: `${site}/plan`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
