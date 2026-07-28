import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

// next/font self-hosts and inlines the font CSS, so there is no render-blocking
// request to a font CDN and no layout shift once the face loads.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

const SITE = "https://wayfare-xi.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "Wayfare — Travel planning, made honest",
    template: "%s · Wayfare",
  },
  description:
    "Real prices, named places and local rules for any trip. Wayfare researches live costs and writes an itinerary that tells you what a place actually costs — including what to skip.",
  keywords: [
    "travel planner",
    "AI itinerary",
    "trip budget",
    "honest travel advice",
    "city guide",
  ],
  authors: [{ name: "Abbas Aamir" }],
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "Wayfare",
    title: "Wayfare — Travel planning, made honest",
    description:
      "Real prices, named places and local rules. An itinerary that tells you what a trip actually costs, and what to skip.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Wayfare — Travel planning, made honest",
    description: "Real prices, named places and local rules for any trip.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F2EC" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1211" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Applies the stored or system theme before first paint. Without this the page
// flashes the wrong palette on load, which is the one thing a theme-aware site
// cannot get away with.
const NO_FLASH = `
(function(){
  try {
    var s = localStorage.getItem("wayfare-theme");
    var d = s ? s === "dark"
              : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", d);
    document.documentElement.style.colorScheme = d ? "dark" : "light";
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      <body
        className={`${fraunces.variable} ${manrope.variable} ${jetbrains.variable} antialiased`}
      >
        {/* Keyboard users land here first and can jump straight to content. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100]
                     focus:rounded-full focus:bg-foreground focus:px-5 focus:py-2.5
                     focus:text-sm focus:font-medium focus:text-background"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
