import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/teaching/invitation-helpers";

/** POST /api/teaching/complete-registration — finish invited user profile */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const surname = typeof body.surname === "string" ? body.surname.trim() : "";

    if (!name || !surname) {
      return NextResponse.json(
        { error: "Name and surname are required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { error: updateError } = await admin.auth.admin.updateUserById(
      user.id,
      {
        user_metadata: {
          ...user.user_metadata,
          name,
          surname,
          registrationComplete: true,
        },
      }
    );

    if (updateError) {
      console.error(
        "[api/teaching/complete-registration] update failed:",
        updateError
      );
      return NextResponse.json(
        { error: "Failed to complete registration" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/teaching/complete-registration] POST failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
