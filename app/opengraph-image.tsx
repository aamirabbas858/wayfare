import { ImageResponse } from "next/og";

// The root metadata declares twitter:card = summary_large_image. Without an
// image to go with it, every share rendered as a bare text card. This file is
// the image; Twitter falls back to the Open Graph one, so a single card covers
// both.
export const alt = "Wayfare — Travel planning, made honest";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0B1211";
const PAPER = "#F1EEE8";
const SIGNAL = "#E4572E";

// ponytail: uses ImageResponse's built-in font rather than Fraunces, so the
// card is off-brand by one typeface. Loading the real face means shipping a
// .ttf and reading it per request; do that only if the card starts mattering
// more than the blank one it replaced.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: INK,
          color: PAPER,
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: SIGNAL,
              display: "flex",
            }}
          />
          <div style={{ fontSize: 26, letterSpacing: 6, opacity: 0.75 }}>
            WAYFARE
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 82, lineHeight: 1.05, letterSpacing: -2 }}>
            Travel planning,
          </div>
          <div
            style={{
              fontSize: 82,
              lineHeight: 1.05,
              letterSpacing: -2,
              color: SIGNAL,
              display: "flex",
            }}
          >
            made honest
          </div>
        </div>

        {/* The product's claim is that its numbers are real, so the card
            shows one rather than describing the feature. */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              fontSize: 30,
              padding: "10px 20px",
              borderRadius: 10,
              background: "rgba(241,238,232,0.08)",
              border: "1px solid rgba(241,238,232,0.18)",
              display: "flex",
            }}
          >
            €63/day
          </div>
          <div style={{ fontSize: 28, opacity: 0.65, display: "flex" }}>
            Real prices, named places, and what to skip.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
