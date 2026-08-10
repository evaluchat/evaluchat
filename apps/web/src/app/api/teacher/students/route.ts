import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getClassesByTeacher } from "@/lib/teaching/class-store";
import { requireAuthenticatedTeacher } from "@/lib/teaching/invitation-helpers";
import { rosterStudentsFromClasses } from "@/lib/teaching/resolve-assignment-students";

/**
 * GET /api/teacher/students
 * Returns unique students enrolled in the authenticated teacher's classes.
 * (Not every auth user — assign scope is class-roster based.)
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) return auth.response;

    const classes = await getClassesByTeacher(auth.user.id);
    const students = rosterStudentsFromClasses(classes);

    return NextResponse.json({ students });
  } catch (e) {
    console.error("[api/teacher/students] Unexpected error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
