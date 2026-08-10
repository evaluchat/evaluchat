import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  addExistingStudentToClass,
  addInvitedStudentToClass,
  findOrCreateClassByName,
} from "@/lib/teaching/class-store";
import {
  createInvitation,
  deleteInvitation,
  getInvitationsByCreator,
} from "@/lib/teaching/invitation-store";
import {
  ensureInviteAuthUser,
  findUserByEmail,
  INVITE_EMAIL_GAP_MS,
  parseEmailList,
  requireAuthenticatedTeacher,
  sleep,
} from "@/lib/teaching/invitation-helpers";
import type { Invitation } from "@/lib/teaching/types";

/**
 * GET /api/teacher/invitations
 * List invitations sent by the authenticated teacher.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) {
      return auth.response;
    }

    const invitations = await getInvitationsByCreator(auth.user.id);
    return NextResponse.json({ invitations });
  } catch (err) {
    console.error("[api/teacher/invitations] GET failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/teacher/invitations
 * Invite students by email to a named class.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) {
      return auth.response;
    }

    const body = await req.json();
    const emails = parseEmailList({
      emails: body.emails,
      text: body.text,
    });
    const className =
      typeof body.className === "string" ? body.className.trim() : "";

    if (!className) {
      return NextResponse.json(
        { error: "Class name is required" },
        { status: 400 }
      );
    }

    const rawEntries = [
      ...(typeof body.emails === "string" ? body.emails.split(/[\n,;]+/) : []),
      ...(typeof body.text === "string" ? body.text.split(/[\n,;]+/) : []),
    ]
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const invalid = rawEntries.filter(
      (entry) => !entry.includes("@") || !emails.includes(entry.toLowerCase())
    ).length;

    if (emails.length === 0) {
      return NextResponse.json(
        { error: "At least one valid email is required" },
        { status: 400 }
      );
    }

    let studentClass = await findOrCreateClassByName(className, auth.user.id);
    const invitations: Invitation[] = [];
    const errors: { email: string; reason: string }[] = [];
    const manualLinks: {
      email: string;
      actionLink: string;
      reason?: string;
    }[] = [];
    let existing = 0;
    let emailed = 0;

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      if (i > 0) {
        await sleep(INVITE_EMAIL_GAP_MS);
      }

      try {
        const existingUser = await findUserByEmail(email);

        if (existingUser) {
          const name =
            (typeof existingUser.user_metadata?.full_name === "string"
              ? existingUser.user_metadata.full_name
              : undefined) ||
            (typeof existingUser.user_metadata?.name === "string"
              ? existingUser.user_metadata.name
              : "") ||
            "";

          const updated = await addExistingStudentToClass(studentClass.id, {
            supabaseUserId: existingUser.id,
            email,
            name,
          });
          if (updated) {
            studentClass = updated;
          }
          existing += 1;
          continue;
        }

        const invitation = await createInvitation({
          email,
          role: "student",
          classId: studentClass.id,
          className: studentClass.name,
          createdBy: auth.user.id,
        });

        try {
          const authInvite = await ensureInviteAuthUser(
            email,
            {
              role: "student",
              class_id: studentClass.id,
              invitation_token: invitation.token,
            },
            invitation.token
          );

          if (authInvite.emailed) {
            emailed += 1;
          } else if (authInvite.actionLink) {
            manualLinks.push({
              email,
              actionLink: authInvite.actionLink,
              reason: authInvite.failureReason,
            });
          }
        } catch (inviteError) {
          await deleteInvitation(invitation.token);
          const reason =
            inviteError instanceof Error
              ? inviteError.message
              : "Invite failed";
          console.error(
            `[api/teacher/invitations] failed for ${email}:`,
            inviteError
          );
          errors.push({ email, reason });
          continue;
        }

        const updated = await addInvitedStudentToClass(studentClass.id, email);
        if (updated) {
          studentClass = updated;
        }

        invitations.push(invitation);
      } catch (inviteError) {
        const reason =
          inviteError instanceof Error ? inviteError.message : "Invite failed";
        console.error(
          `[api/teacher/invitations] failed for ${email}:`,
          inviteError
        );
        errors.push({ email, reason });
      }
    }

    return NextResponse.json({
      success: true,
      invited: invitations.length,
      emailed,
      existing,
      failed: errors.length,
      invalid,
      invitations,
      manualLinks,
      class: {
        id: studentClass.id,
        name: studentClass.name,
        teacherId: studentClass.teacherId,
        students: studentClass.students,
        createdAt: studentClass.createdAt,
        updatedAt: studentClass.updatedAt,
      },
      errors,
    });
  } catch (err) {
    console.error("[api/teacher/invitations] POST failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
