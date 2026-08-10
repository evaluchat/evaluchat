import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createStudentInitiatedAssignment } from "@/lib/teaching/self-initiated";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * POST /api/teaching/self-initiate
 * Body: { title, prompt, agentInstructions?, starterMarkdown? }
 * Creates a student-owned assignment-style record registered to the caller so
 * it shows up in their assignment list (AI co-creation / oral-defence angle).
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      title?: string;
      prompt?: string;
      agentInstructions?: string;
      starterMarkdown?: string;
    };

    const title = (body.title ?? "").trim();
    const prompt = (body.prompt ?? "").trim();

    if (!title || !prompt) {
      return NextResponse.json(
        { error: "title and prompt are required" },
        { status: 400 }
      );
    }

    const fullName = user.user_metadata?.full_name;
    const name =
      typeof fullName === "string" && fullName.trim()
        ? fullName.trim()
        : user.email?.split("@")[0] || "Student";

    const id = `self-${slugify(title)}-${Date.now().toString(36)}`;

    const assignment = await createStudentInitiatedAssignment({
      id,
      title,
      prompt,
      agentInstructions: body.agentInstructions,
      starterMarkdown: body.starterMarkdown,
      studentId: user.id,
      studentName: name,
    });

    return NextResponse.json({ ok: true, assignment });
  } catch (err) {
    console.error("[api/teaching/self-initiate] POST failed:", err);
    return NextResponse.json(
      { error: "Failed to create self-initiated assignment" },
      { status: 500 }
    );
  }
}
