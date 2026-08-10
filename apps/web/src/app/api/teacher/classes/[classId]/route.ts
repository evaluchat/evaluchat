import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  deleteClass,
  getClassById,
  updateClass,
} from "@/lib/teaching/class-store";
import { requireAuthenticatedTeacher } from "@/lib/teaching/invitation-helpers";
import type { ClassStudent } from "@/lib/teaching/types";

type RouteContext = { params: { classId: string } };

async function requireOwnedClass(classId: string, teacherId: string) {
  const studentClass = await getClassById(classId);
  if (!studentClass) {
    return {
      studentClass: null,
      response: NextResponse.json(
        { error: "Class not found" },
        { status: 404 }
      ),
    };
  }

  if (studentClass.teacherId !== teacherId) {
    return {
      studentClass: null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { studentClass, response: null };
}

/**
 * PATCH /api/teacher/classes/[classId]
 * Update class name or student roster.
 */
export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { classId } = context.params;
    const supabase = await createClient();
    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) {
      return auth.response;
    }

    const ownership = await requireOwnedClass(classId, auth.user.id);
    if (ownership.response) {
      return ownership.response;
    }

    const body = await req.json();
    const updates: { name?: string; students?: ClassStudent[] } = {};

    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }

    if (Array.isArray(body.students)) {
      updates.students = body.students;
    }

    if (updates.name === undefined && updates.students === undefined) {
      return NextResponse.json(
        { error: "No valid updates provided" },
        { status: 400 }
      );
    }

    const updated = await updateClass(classId, updates);
    return NextResponse.json({ class: updated });
  } catch (err) {
    console.error("[api/teacher/classes/[classId]] PATCH failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/teacher/classes/[classId]
 * Delete a class.
 */
export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const { classId } = context.params;
    const supabase = await createClient();
    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) {
      return auth.response;
    }

    const ownership = await requireOwnedClass(classId, auth.user.id);
    if (ownership.response) {
      return ownership.response;
    }

    await deleteClass(classId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/teacher/classes/[classId]] DELETE failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
