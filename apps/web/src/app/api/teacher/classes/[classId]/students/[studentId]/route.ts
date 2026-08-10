import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getClassById,
  removeStudentFromClass,
} from "@/lib/teaching/class-store";
import { requireAuthenticatedTeacher } from "@/lib/teaching/invitation-helpers";

type RouteContext = { params: { classId: string; studentId: string } };

/**
 * DELETE /api/teacher/classes/[classId]/students/[studentId]
 * Remove a student from a class.
 */
export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const { classId, studentId } = context.params;
    const supabase = await createClient();
    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) {
      return auth.response;
    }

    const studentClass = await getClassById(classId);
    if (!studentClass) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    if (studentClass.teacherId !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const removed = await removeStudentFromClass(classId, studentId);
    if (!removed) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(
      "[api/teacher/classes/[classId]/students/[studentId]] DELETE failed:",
      err
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
