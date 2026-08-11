import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { acceptStudentInClass } from "@/lib/teaching/class-store";
import {
  assertInvitationCanBeLinked,
  finalizeAcceptedInvitation,
} from "@/lib/teaching/invitation-accept";
import {
  acceptInvitation,
  getInvitation,
} from "@/lib/teaching/invitation-store";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * POST /api/invitations/[token]/accept
 * Accept an invitation for the authenticated user.
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
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

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const existing = await getInvitation(token);
    if (!existing || existing.status !== "pending") {
      return NextResponse.json(
        { error: "Invitation not found or no longer valid" },
        { status: 404 }
      );
    }

    if (
      user.email &&
      existing.email.toLowerCase() !== user.email.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "Invitation email does not match authenticated user" },
        { status: 403 }
      );
    }

    try {
      await assertInvitationCanBeLinked(existing, user.id, user);
    } catch (linkError) {
      const message =
        linkError instanceof Error ? linkError.message : "Cannot accept invite";
      return NextResponse.json({ error: message }, { status: 409 });
    }

    let invitation;
    try {
      invitation = await acceptInvitation(token);
    } catch (acceptError) {
      const message =
        acceptError instanceof Error ? acceptError.message : "Accept failed";
      const status = message.includes("expired") ? 410 : 400;
      return NextResponse.json({ error: message }, { status });
    }

    if (invitation.classId) {
      await acceptStudentInClass(invitation.classId, {
        supabaseUserId: user.id,
        email: invitation.email,
        name,
      });
    }

    try {
      const { redirectTo } = await finalizeAcceptedInvitation({
        user,
        invitation,
        name,
      });
      return NextResponse.json({ invitation, redirectTo });
    } catch (finalizeError) {
      console.error(
        "[api/invitations/[token]/accept] finalize failed:",
        finalizeError
      );
      return NextResponse.json(
        {
          error:
            finalizeError instanceof Error
              ? finalizeError.message
              : "Invitation accepted but failed to update user profile",
        },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("[api/invitations/[token]/accept] POST failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
