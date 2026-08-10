import { NextResponse } from "next/server";
import { getApparatusById } from "@/lib/apparatuses/registry";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedTeacher } from "@/lib/teaching/invitation-helpers";
import {
  getOrgApparatuses,
  getOrgByAdmin,
  getOrgByTeacher,
  setOrgApparatuses,
} from "@/lib/teaching/org-store";
import { isOrgAdmin } from "@/lib/teaching/teacher-utils";
import { listApparatuses } from "@/lib/apparatuses/registry";

export const dynamic = "force-dynamic";

/** GET returns the reviewed catalog plus this organisation's enablement set. */
export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) return auth.response;
    const org =
      (await getOrgByAdmin(auth.user.id)) || (await getOrgByTeacher(auth.user.id));
    if (!org) return NextResponse.json({ apparatuses: [], enabled: [] });
    const enabled = await getOrgApparatuses(org.id);
    return NextResponse.json({ apparatuses: listApparatuses(), enabled });
  } catch (err) {
    console.error("[api/teacher/org/apparatuses] GET failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/teacher/org/apparatuses
 * Org-admin toggle of an apparatus id.
 */
export async function PATCH(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAuthenticatedTeacher(supabase);
    if (auth.response) {
      return auth.response;
    }

    if (!isOrgAdmin(auth.user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const org = await getOrgByAdmin(auth.user.id);
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const apparatusId =
      typeof body?.apparatusId === "string" ? body.apparatusId.trim() : "";
    const enabled = body?.enabled === true;

    if (!apparatusId || typeof body?.enabled !== "boolean") {
      return NextResponse.json(
        { error: "apparatusId (string) and enabled (boolean) required" },
        { status: 400 }
      );
    }

    const known = getApparatusById(apparatusId);
    if (!known) {
      return NextResponse.json(
        { error: `Unknown apparatus id: ${apparatusId}` },
        { status: 400 }
      );
    }

    const current = await getOrgApparatuses(org.id);
    let next = [...current];
    if (enabled) {
      if (!next.includes(apparatusId)) {
        next.push(apparatusId);
      }
    } else {
      next = next.filter((id) => id !== apparatusId);
    }

    const updated = await setOrgApparatuses(org.id, next);
    return NextResponse.json({ org: updated });
  } catch (err) {
    console.error("[api/teacher/org/apparatuses] PATCH failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
