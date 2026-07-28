import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { dbConfigured } from "@/lib/db";
import { createTrip } from "@/lib/db/queries";

const placeSchema = z.object({
  name: z.string().max(200),
  address: z.string().max(300).optional(),
  lat: z.number(),
  lng: z.number(),
  day: z.number(),
  type: z.string().max(60).optional(),
});

// Bounds mirror the planner's own limits. The markdown ceiling is generous
// but finite: without one, a client could store arbitrarily large rows.
const bodySchema = z.object({
  origin: z.string().min(1).max(80),
  destination: z.string().min(1).max(80),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  budget: z.number().int().min(1).max(1_000_000_000),
  currency: z.string().max(8),
  travelers: z.number().int().min(1).max(20),
  interests: z.string().max(500),
  markdown: z.string().min(1).max(120_000),
  places: z.array(placeSchema).max(200).default([]),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Sign in to save trips." }, { status: 401 });
  }
  if (!dbConfigured) {
    return Response.json({ error: "Saving is unavailable." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid trip data." },
      { status: 400 }
    );
  }

  try {
    // userId comes from the session, never from the request body — otherwise
    // a caller could write rows into someone else's account.
    const row = await createTrip({ ...parsed.data, userId: session.user.id });
    return Response.json({ id: row.id }, { status: 201 });
  } catch (err) {
    console.error("[trips] create failed:", err);
    return Response.json({ error: "Could not save the trip." }, { status: 500 });
  }
}
