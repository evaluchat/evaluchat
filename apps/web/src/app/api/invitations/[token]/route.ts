import { NextResponse } from "next/server";
import { getInvitation } from "@/lib/teaching/invitation-store";
import type { Invitation } from "@/lib/teaching/types";

type RouteContext = { params: Promise<{ token: string }> };

function toPublicInvitation(invitation: Invitation) {
  return {
    token: invitation.token,
    email: invitation.email,
    role: invitation.role,
    classId: invitation.classId,
    className: invitation.className,
    status: invitation.status,
    expires_at: invitation.expires_at,
  };
}

/**
 * GET /api/invitations/[token]
 * View invitation details by token.
 */
export async function GET(_req: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const invitation = await getInvitation(token);

    if (!invitation || invitation.status !== "pending") {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ invitation: toPublicInvitation(invitation) });
  } catch (err) {
    console.error("[api/invitations/[token]] GET failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
