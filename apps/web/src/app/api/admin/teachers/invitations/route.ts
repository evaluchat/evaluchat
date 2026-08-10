import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createInvitation,
  deleteInvitation,
  getInvitationsByCreator,
} from "@/lib/teaching/invitation-store";
import {
  ensureInviteAuthUser,
  requireAuthenticatedTeacher,
} from "@/lib/teaching/invitation-helpers";
import { createOrg, getOrgByAdmin } from "@/lib/teaching/org-store";
import { canInviteTeachers } from "@/lib/teaching/teacher-utils";

/**
 * GET /api/admin/teachers/invitations
 * List teacher invitations created by the org admin.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) {
      return auth.response;
    }

    if (!canInviteTeachers(auth.user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const invitations = (await getInvitationsByCreator(auth.user.id))
      .filter((entry) => entry.role === "teacher")
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

    return NextResponse.json({ invitations });
  } catch (err) {
    console.error("[api/admin/teachers/invitations] GET failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/teachers/invitations
 * Org-admin only: invite a delegated teacher by email.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) {
      return auth.response;
    }

    if (!canInviteTeachers(auth.user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
    }

    // Ensure org exists so accept can link the teacher (covers migrated admins).
    const existingOrg = await getOrgByAdmin(auth.user.id);
    if (!existingOrg) {
      await createOrg({ adminUserId: auth.user.id });
    }

    const invitation = await createInvitation({
      email,
      role: "teacher",
      createdBy: auth.user.id,
    });

    try {
      await ensureInviteAuthUser(
        email,
        {
          role: "teacher",
          adminId: auth.user.id,
          invitation_token: invitation.token,
        },
        invitation.token
      );
    } catch (inviteError) {
      await deleteInvitation(invitation.token);
      console.error(
        "[api/admin/teachers/invitations] invite failed:",
        inviteError
      );
      return NextResponse.json(
        {
          error:
            inviteError instanceof Error
              ? inviteError.message
              : "Failed to send teacher invitation",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, invitation });
  } catch (err) {
    console.error("[api/admin/teachers/invitations] POST failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
