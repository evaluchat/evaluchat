import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listCustomAssignmentsForTeacher } from "@/lib/teaching/assignment-file-store";
import { getClassesByTeacher } from "@/lib/teaching/class-store";
import { requireAuthenticatedTeacher } from "@/lib/teaching/invitation-helpers";
import { canReadTeacherWork } from "@/lib/teaching/org-read-scope";
import { isOrgAdmin } from "@/lib/teaching/teacher-utils";

type RouteContext = { params: Promise<{ teacherId: string }> };

/**
 * GET /api/teacher/org/teachers/[teacherId]
 * Org-admin read-only view of a linked teacher's classes + custom assignments.
 * Mutate stays on owning teacherId routes (`teacherOwnsAssignment` unchanged).
 */
export async function GET(_req: Request, context: RouteContext) {
  try {
    const { teacherId: rawTeacherId } = await context.params;
    const teacherId = rawTeacherId?.trim();
    if (!teacherId) {
      return NextResponse.json({ error: "Missing teacherId" }, { status: 400 });
    }

    const supabase = await createClient();
    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) {
      return auth.response;
    }

    if (!isOrgAdmin(auth.user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Admins drill into linked teachers only — not a substitute for own list UI.
    if (teacherId === auth.user.id) {
      return NextResponse.json(
        { error: "Use your own assignments and classes views for your work" },
        { status: 400 }
      );
    }

    const allowed = await canReadTeacherWork(auth.user.id, teacherId);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [classes, assignments] = await Promise.all([
      getClassesByTeacher(teacherId),
      listCustomAssignmentsForTeacher(teacherId),
    ]);

    return NextResponse.json({
      teacherId,
      classes,
      assignments,
    });
  } catch (err) {
    console.error("[api/teacher/org/teachers/[teacherId]] GET failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
