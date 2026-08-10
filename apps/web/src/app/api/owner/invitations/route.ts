import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createInvitation,
  deleteInvitation,
  getInvitationsByCreator,
} from "@/lib/teaching/invitation-store";
import {
  ensureInviteAuthUser,
  requireAdmin,
} from "@/lib/teaching/invitation-helpers";

/**
 * GET /api/owner/invitations
 * List org-admin invitations created by the platform owner.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (auth.response) {
      return auth.response;
    }

    const invitations = (await getInvitationsByCreator(auth.user.id))
      .filter((entry) => entry.role === "admin")
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

    return NextResponse.json({ invitations });
  } catch (err) {
    console.error("[api/owner/invitations] GET failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/owner/invitations
 * Owner-only: invite an org admin by email.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (auth.response) {
      return auth.response;
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

    const invitation = await createInvitation({
      email,
      role: "admin",
      createdBy: auth.user.id,
    });

    try {
      await ensureInviteAuthUser(
        email,
        { invitation_token: invitation.token },
        invitation.token
      );
    } catch (inviteError) {
      await deleteInvitation(invitation.token);
      console.error("[api/owner/invitations] invite failed:", inviteError);
      return NextResponse.json(
        {
          error:
            inviteError instanceof Error
              ? inviteError.message
              : "Failed to send admin invitation",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, invitation });
  } catch (err) {
    console.error("[api/owner/invitations] POST failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
