import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedTeacher } from "@/lib/teaching/invitation-helpers";
import { getOrgByAdmin } from "@/lib/teaching/org-store";
import { isOrgAdmin } from "@/lib/teaching/teacher-utils";

/**
 * GET /api/teacher/org
 * Org admins receive their org roster; delegated teachers get `{ org: null }`.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) {
      return auth.response;
    }

    if (!isOrgAdmin(auth.user)) {
      return NextResponse.json({ org: null });
    }

    const org = (await getOrgByAdmin(auth.user.id)) ?? null;
    return NextResponse.json({ org });
  } catch (err) {
    console.error("[api/teacher/org] GET failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
