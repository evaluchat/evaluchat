import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClass, getClassesByTeacher } from "@/lib/teaching/class-store";
import { requireAuthenticatedTeacher } from "@/lib/teaching/invitation-helpers";

/**
 * GET /api/teacher/classes
 * List classes for the authenticated teacher, with enrolled students.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) {
      return auth.response;
    }

    const classes = await getClassesByTeacher(auth.user.id);
    return NextResponse.json({ classes });
  } catch (err) {
    console.error("[api/teacher/classes] GET failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) {
      return auth.response;
    }

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json(
        { error: "Class name is required" },
        { status: 400 }
      );
    }

    const studentClass = await createClass(name, auth.user.id);
    return NextResponse.json({
      class: { ...studentClass, students: [] },
    });
  } catch (err) {
    console.error("[api/teacher/classes] POST failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
