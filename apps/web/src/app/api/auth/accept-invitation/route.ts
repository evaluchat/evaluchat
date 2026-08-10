import { NextResponse } from "next/server";
import { acceptStudentInClass } from "@/lib/teaching/class-store";
import {
  applyInvitationOrgEffects,
  assertInvitationCanBeLinked,
  buildInvitationAuthUpdates,
  redirectPathForInvitationRole,
} from "@/lib/teaching/invitation-accept";
import {
  acceptInvitation,
  getInvitation,
} from "@/lib/teaching/invitation-store";
import {
  createAdminClient,
  findUserByEmail,
} from "@/lib/teaching/invitation-helpers";

/**
 * POST /api/auth/accept-invitation
 * Accept an invitation and create the user account (no auth required).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const invitation = await getInvitation(token);
    if (!invitation || invitation.status !== "pending") {
      return NextResponse.json(
        { error: "Invitation not found or expired" },
        { status: 400 }
      );
    }

    const existingUser = await findUserByEmail(invitation.email);
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please log in." },
        { status: 400 }
      );
    }

    const authUpdates = buildInvitationAuthUpdates({
      invitation,
      name,
      existingUserMetadata: {
        invitation_token: token,
        registrationComplete: true,
      },
    });

    const admin = createAdminClient();
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: invitation.email,
        password,
        email_confirm: true,
        ...authUpdates,
      });

    if (createError || !created.user) {
      console.error(
        "[api/auth/accept-invitation] createUser failed:",
        createError
      );
      return NextResponse.json(
        { error: createError?.message ?? "Failed to create account" },
        { status: 500 }
      );
    }

    try {
      await assertInvitationCanBeLinked(invitation, created.user.id);
    } catch (linkError) {
      // User was just created — clean up is best-effort; surface the link error.
      const message =
        linkError instanceof Error ? linkError.message : "Cannot accept invite";
      return NextResponse.json({ error: message }, { status: 409 });
    }

    try {
      await acceptInvitation(token);
    } catch (acceptError) {
      const message =
        acceptError instanceof Error ? acceptError.message : "Accept failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (invitation.classId) {
      await acceptStudentInClass(invitation.classId, {
        supabaseUserId: created.user.id,
        email: invitation.email,
        name,
      });
    }

    try {
      await applyInvitationOrgEffects({
        invitation,
        userId: created.user.id,
      });
    } catch (orgError) {
      console.error(
        "[api/auth/accept-invitation] org effects failed:",
        orgError
      );
      return NextResponse.json(
        {
          error:
            orgError instanceof Error
              ? orgError.message
              : "Account created but org linking failed",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      redirectTo: redirectPathForInvitationRole(invitation.role),
    });
  } catch (err) {
    console.error("[api/auth/accept-invitation] POST failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
