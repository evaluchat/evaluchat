import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  closeCustomAssignmentForTeacher,
  deleteCustomAssignmentForTeacher,
  getCustomAssignmentById,
  listCustomAssignmentsForTeacher,
  replaceTeacherCustomAssignments,
  readAllCustomAssignments,
} from "@/lib/teaching/assignment-file-store";
import {
  assertFreeAssignmentCap,
  normalizeAssignmentCommercialFields,
  normalizeAssignmentTier,
} from "@/lib/teaching/assignment-policy";
import { requireAuthenticatedTeacher } from "@/lib/teaching/invitation-helpers";
import type { StudentAssignment } from "@/lib/teaching/types";
import { resolveApparatusConfiguration, getApparatusSpecification } from "@/lib/apparatuses/runtime";
import { getOrgApparatuses, getOrgByAdmin, getOrgByTeacher } from "@/lib/teaching/org-store";
import { getSeedAssignmentById } from "@/lib/teaching/seed-loader";
import { readFile } from "fs/promises";
import { join } from "path";

async function isAssignmentAssignedToStudent(
  assignmentId: string,
  userId: string
): Promise<boolean> {
  try {
    const path =
      process.env.TEACHING_REGISTRY_PATH?.trim() ||
      join(process.cwd(), "data", "teaching", "registry.json");
    const raw = await readFile(path, "utf-8");
    const registry = JSON.parse(raw) as Array<{
      assignmentId?: string;
      assignedStudentIds?: string[];
    }>;
    return registry.some(
      (entry) =>
        entry.assignmentId === assignmentId &&
        entry.assignedStudentIds?.includes(userId)
    );
  } catch {
    return false;
  }
}

async function getAssignmentOrg(assignment: StudentAssignment) {
  if (!assignment.teacherId) return undefined;
  const org =
    (await getOrgByAdmin(assignment.teacherId)) ||
    (await getOrgByTeacher(assignment.teacherId));
  return org;
}

/**
 * GET /api/teaching/assignments
 *   — teacher list: only that teacher's custom assignments
 * GET /api/teaching/assignments?id=xxx
 *   — single lookup for any authenticated user (students resolve assigned work)
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const assignment =
        (await getCustomAssignmentById(id)) || (await getSeedAssignmentById(id));
      if (!assignment) {
        return NextResponse.json(
          { error: "Not found", assignment: null },
          { status: 404 }
        );
      }
      const hydratedAssignment = assignment.apparatusConfiguration
        ? assignment
        : {
            ...assignment,
            ...resolveApparatusConfiguration({
              apparatusId: assignment.apparatusId,
              profileId: assignment.apparatusProfileId,
            }),
          };
      const owns = hydratedAssignment.teacherId === user.id;
      const assigned = await isAssignmentAssignedToStudent(id, user.id);
      const assignmentOrg = await getAssignmentOrg(hydratedAssignment);
      const userOrgId =
        typeof user.user_metadata?.orgId === "string"
          ? user.user_metadata.orgId
          : undefined;
      const userAdminId =
        typeof user.user_metadata?.adminId === "string"
          ? user.user_metadata.adminId
          : undefined;
      const sameOrganisation = assignmentOrg
        ? userOrgId
          ? assignmentOrg.id === userOrgId
          : userAdminId === assignmentOrg.adminUserId
        : true;
      if (!owns && (!assigned || !sameOrganisation)) {
        return NextResponse.json({ error: "Forbidden", assignment: null }, { status: 403 });
      }
      return NextResponse.json({ assignment: hydratedAssignment });
    }

    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) {
      return auth.response;
    }

    const assignments = await listCustomAssignmentsForTeacher(auth.user.id);
    return NextResponse.json({ assignments });
  } catch (err) {
    console.error("[api/teaching/assignments] GET failed:", err);
    return NextResponse.json(
      { error: "Failed to read assignments" },
      { status: 500 }
    );
  }
}

/** DELETE /api/teaching/assignments?id=xxx — owner-only delete */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) {
      return auth.response;
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const result = await deleteCustomAssignmentForTeacher(auth.user.id, id);
    if (result === "not_found") {
      return NextResponse.json(
        { deleted: false, error: "Not found" },
        { status: 404 }
      );
    }
    if (result === "forbidden") {
      return NextResponse.json(
        { deleted: false, error: "Forbidden" },
        { status: 403 }
      );
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[api/teaching/assignments] DELETE failed:", err);
    return NextResponse.json(
      { error: "Failed to delete assignment" },
      { status: 500 }
    );
  }
}

/** PATCH /api/teaching/assignments?id=xxx — close (lifecycleStatus: closed) */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) {
      return auth.response;
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const lifecycleStatus = (body as { lifecycleStatus?: string })
      ?.lifecycleStatus;
    if (lifecycleStatus !== "closed") {
      return NextResponse.json(
        { error: 'Only lifecycleStatus: "closed" is supported' },
        { status: 400 }
      );
    }

    const result = await closeCustomAssignmentForTeacher(auth.user.id, id);
    if (!result.ok) {
      if (result.error === "not_found") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (result.error === "forbidden") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.json(
        { error: "Assignment is already closed", assignment: null },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, assignment: result.assignment });
  } catch (err) {
    console.error("[api/teaching/assignments] PATCH failed:", err);
    return NextResponse.json(
      { error: "Failed to update assignment" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/teaching/assignments — replace THIS teacher's custom assignments.
 * Other teachers' rows are merged in on the server (not a global wipe).
 * Enforces free active-assignment cap (5 open free).
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) {
      return auth.response;
    }

    const { assignments } = await req.json();
    if (!Array.isArray(assignments)) {
      return NextResponse.json(
        { error: "assignments must be an array" },
        { status: 400 }
      );
    }

    const teacherId = auth.user.id;
    const org =
      (await getOrgByAdmin(teacherId)) || (await getOrgByTeacher(teacherId));
    const enabledApparatuses = org
      ? await getOrgApparatuses(org.id)
      : [];
    const existingAssignments = await readAllCustomAssignments();
    const normalized = (assignments as StudentAssignment[]).map((a) =>
      normalizeAssignmentCommercialFields({
        ...a,
        // The authenticated teacher is the only possible owner. Never let a
        // browser-created row write into another organisation's namespace.
        teacherId,
        tier: normalizeAssignmentTier(a.tier),
      })
    );

    for (const assignment of normalized) {
      const previous = existingAssignments.find((entry) => entry.id === assignment.id);
      const requestedId = assignment.apparatusId || "ai-assisted-essay";
      if (previous?.apparatusConfiguration) {
        Object.assign(assignment, {
          apparatusId: previous.apparatusId,
          apparatusVersion: previous.apparatusVersion,
          apparatusProfileId: previous.apparatusProfileId,
          apparatusConfiguration: previous.apparatusConfiguration,
        });
        continue;
      }
      if (!enabledApparatuses.includes(requestedId)) {
        throw new Error(`Apparatus ${requestedId} is not enabled for this organisation`);
      }
      const specification = getApparatusSpecification(requestedId);
      if (!specification) {
        throw new Error(`Unknown apparatus id: ${requestedId}`);
      }
      if (
        assignment.apparatusProfileId &&
        !specification.profiles.some(
          (profile) => profile.id === assignment.apparatusProfileId
        )
      ) {
        throw new Error(
          `Unknown apparatus profile ${requestedId}/${assignment.apparatusProfileId}`
        );
      }
      const resolved = resolveApparatusConfiguration({
        apparatusId: requestedId,
        profileId: assignment.apparatusProfileId,
      });
      Object.assign(assignment, resolved);
    }

    const cap = assertFreeAssignmentCap(normalized, teacherId);
    if (!cap.ok) {
      return NextResponse.json({ error: cap.error }, { status: 400 });
    }

    const saved = await replaceTeacherCustomAssignments(teacherId, normalized);
    return NextResponse.json({ ok: true, count: saved.length });
  } catch (err) {
    console.error("[api/teaching/assignments] POST failed:", err);
    const message = err instanceof Error ? err.message : "Failed to save assignments";
    const status = /apparatus|organisation/i.test(message) ? 400 : 500;
    return NextResponse.json(
      { error: status === 400 ? message : "Failed to save assignments" },
      { status }
    );
  }
}
