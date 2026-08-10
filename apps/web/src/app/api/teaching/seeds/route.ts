import { NextResponse } from "next/server";
import { loadSeedAssignments } from "@/lib/teaching/seed-loader";

/** GET /api/teaching/seeds — list all seed assignments (from disk, not bundle) */
export async function GET() {
  try {
    const seeds = await loadSeedAssignments();
    return NextResponse.json({ seeds });
  } catch (err) {
    console.error("[api/teaching/seeds] GET failed:", err);
    return NextResponse.json(
      { error: "Failed to read seeds" },
      { status: 500 }
    );
  }
}
