import { NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import {
  getCustomAssignmentById,
} from "@/lib/teaching/assignment-file-store";
import {
  assertStudentCap,
} from "@/lib/teaching/assignment-policy";
import { getSeedAssignmentById } from "@/lib/teaching/seed-loader";
import { createClient } from "@/lib/supabase/server";
import { isTeacher } from "@/lib/teaching/teacher-utils";
import { getOrgByAdmin, getOrgByTeacher } from "@/lib/teaching/org-store";
import { readAllCustomAssignments } from "@/lib/teaching/assignment-file-store";

export interface AssignmentEntry {
  assignmentId: string;
  assignedStudentIds: string[];
  assignedAt: string;
}

function resolveFilePath(): string {
  return (
    process.env.TEACHING_REGISTRY_PATH?.trim() ||
    join(process.cwd(), "data", "teaching", "registry.json")
  );
}

async function readRegistry(): Promise<AssignmentEntry[]> {
  try {
    const raw = await readFile(resolveFilePath(), "utf-8");
    return JSON.parse(raw) as AssignmentEntry[];
  } catch {
    return [];
  }
}

async function writeRegistry(registry: AssignmentEntry[]): Promise<void> {
  const filePath = resolveFilePath();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(registry, null, 2), "utf-8");
}

/** GET /api/teaching/registry — list all assignment-student mappings */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const registry = await readRegistry();
    if (!isTeacher(user)) {
      return NextResponse.json({
        registry: registry.filter((entry) => entry.assignedStudentIds.includes(user.id)),
      });
    }
    const org = (await getOrgByAdmin(user.id)) || (await getOrgByTeacher(user.id));
    const orgTeacherIds = org ? [org.adminUserId, ...org.teacherIds] : [user.id];
    const assignments = await readAllCustomAssignments();
    const ownedIds = new Set(
      assignments
        .filter((assignment) => orgTeacherIds.includes(assignment.teacherId || ""))
        .map((assignment) => assignment.id)
    );
    return NextResponse.json({
      registry: registry.filter((entry) => ownedIds.has(entry.assignmentId)),
    });
  } catch (err) {
    console.error("[api/teaching/registry] GET failed:", err);
    return NextResponse.json(
      { error: "Failed to read registry" },
      { status: 500 }
    );
  }
}

/** DELETE /api/teaching/registry?assignmentId=xxx — remove all registry entries for an assignment */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !isTeacher(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const url = new URL(request.url);
    const assignmentId = url.searchParams.get("assignmentId");
    if (!assignmentId) {
      return NextResponse.json(
        { error: "Missing assignmentId" },
        { status: 400 }
      );
    }
    const registry = await readRegistry();
    const assignment =
      (await getCustomAssignmentById(assignmentId)) ||
      (await getSeedAssignmentById(assignmentId));
    if (assignment?.teacherId && assignment.teacherId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const filtered = registry.filter(
      (e: AssignmentEntry) => e.assignmentId !== assignmentId
    );
    await writeRegistry(filtered);
    return NextResponse.json({
      deleted: true,
      removed: registry.length - filtered.length,
    });
  } catch (err) {
    console.error("[api/teaching/registry] DELETE failed:", err);
    return NextResponse.json(
      { error: "Failed to delete registry entries" },
      { status: 500 }
    );
  }
}

/** POST /api/teaching/registry — save assignment/student mappings. */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !isTeacher(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { registry } = await req.json();
    if (!Array.isArray(registry)) {
      return NextResponse.json(
        { error: "registry must be an array" },
        { status: 400 }
      );
    }

    for (const entry of registry as AssignmentEntry[]) {
      if (!entry || typeof entry.assignmentId !== "string") {
        return NextResponse.json(
          { error: "Each registry entry needs assignmentId" },
          { status: 400 }
        );
      }
      const studentIds = Array.isArray(entry.assignedStudentIds)
        ? entry.assignedStudentIds
        : [];
      const assignment =
        (await getCustomAssignmentById(entry.assignmentId)) ||
        (await getSeedAssignmentById(entry.assignmentId));
      const tier = assignment?.tier;
      if (assignment?.teacherId && assignment.teacherId !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const cap = assertStudentCap(studentIds, tier);
      if (!cap.ok) {
        return NextResponse.json(
          {
            error: `${cap.error} (assignment ${entry.assignmentId})`,
          },
          { status: 400 }
        );
      }
    }

    await writeRegistry(registry);
    return NextResponse.json({
      ok: true,
      count: registry.length,
    });
  } catch (err) {
    console.error("[api/teaching/registry] POST failed:", err);
    return NextResponse.json(
      { error: "Failed to save registry" },
      { status: 500 }
    );
  }
}
