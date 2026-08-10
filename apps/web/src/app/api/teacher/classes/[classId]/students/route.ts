import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getClassById,
  updateStudentNameInClass,
} from "@/lib/teaching/class-store";
import { requireAuthenticatedTeacher } from "@/lib/teaching/invitation-helpers";

type RouteContext = { params: { classId: string } };

function toStudentId(supabaseUserId: string, email: string): string {
  return supabaseUserId || email;
}

/**
 * GET /api/teacher/classes/[classId]/students
 * List students in a class owned by the authenticated teacher.
 */
export async function GET(_req: Request, context: RouteContext) {
  try {
    const { classId } = context.params;
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

    const students = studentClass.students.map((student) => ({
      studentId: toStudentId(student.supabaseUserId, student.email),
      email: student.email,
      name: student.name,
    }));

    return NextResponse.json({ students });
  } catch (err) {
    console.error("[api/teacher/classes/[classId]/students] GET failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/teacher/classes/[classId]/students
 * Update display names for students in a class.
 */
export async function PUT(req: Request, context: RouteContext) {
  try {
    const { classId } = context.params;
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

    const body = await req.json();
    const updates = Array.isArray(body.students) ? body.students : [];

    for (const entry of updates) {
      const studentId =
        typeof entry.studentId === "string" ? entry.studentId : "";
      const name = typeof entry.name === "string" ? entry.name.trim() : "";

      if (!studentId || !name) {
        continue;
      }

      await updateStudentNameInClass(classId, studentId, name);
    }

    const updatedClass = await getClassById(classId);
    const students = (updatedClass?.students ?? []).map((student) => ({
      studentId: toStudentId(student.supabaseUserId, student.email),
      email: student.email,
      name: student.name,
    }));

    return NextResponse.json({ students });
  } catch (err) {
    console.error("[api/teacher/classes/[classId]/students] PUT failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
