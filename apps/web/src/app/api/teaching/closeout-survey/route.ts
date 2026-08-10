import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appendCloseoutSurvey } from "@/lib/teaching/closeout-survey-store";
import { requireAuthenticatedTeacher } from "@/lib/teaching/invitation-helpers";

function clampLikert(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  if (n < 1 || n > 5) return null;
  return n;
}

/** POST /api/teaching/closeout-survey — append one JSONL survey row */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) {
      return auth.response;
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const assignmentId =
      typeof payload.assignmentId === "string"
        ? payload.assignmentId.trim()
        : "";
    if (!assignmentId || assignmentId.length > 256) {
      return NextResponse.json(
        { error: "assignmentId is required" },
        { status: 400 }
      );
    }

    const usefulness = clampLikert(payload.usefulness);
    if (usefulness === null) {
      return NextResponse.json(
        { error: "usefulness must be an integer from 1 to 5" },
        { status: 400 }
      );
    }

    const wouldPayForPremium = clampLikert(payload.wouldPayForPremium) ?? 3;
    const freeText =
      typeof payload.freeText === "string"
        ? payload.freeText.trim().slice(0, 2000)
        : undefined;

    const record = await appendCloseoutSurvey({
      assignmentId,
      teacherId: auth.user.id,
      timestamp: new Date().toISOString(),
      usefulness,
      wouldPayForPremium,
      ...(freeText ? { freeText } : {}),
    });

    return NextResponse.json({ ok: true, record });
  } catch (err) {
    console.error("[api/teaching/closeout-survey] POST failed:", err);
    return NextResponse.json(
      { error: "Failed to save survey" },
      { status: 500 }
    );
  }
}
