import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { dbConfigured } from "@/lib/db";
import { deleteTrip } from "@/lib/db/queries";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!dbConfigured) {
    return Response.json({ error: "Unavailable." }, { status: 503 });
  }

  const { id } = await params;

  // deleteTrip filters on userId, so a request for someone else's trip
  // removes nothing and is reported as missing rather than forbidden — which
  // would confirm the id exists.
  const removed = await deleteTrip(session.user.id, id);
  if (!removed) {
    return Response.json({ error: "Trip not found." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
