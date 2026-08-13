import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import {
  submitWorkspaceForm,
  WorkspaceFormAlreadySubmittedError,
  WorkspaceItemNotFoundError,
} from "@/lib/workspace/store";
import { FormValidationError } from "@/lib/workspace/form-validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const body = await request.json();
    const result = await submitWorkspaceForm(auth.user.id, id, body?.values);
    return NextResponse.json(
      { item: result.item, idempotent: result.idempotent },
      { status: result.idempotent ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof WorkspaceItemNotFoundError) {
      return NextResponse.json(
        { error: "Workspace form not found" },
        { status: 404 }
      );
    }
    if (error instanceof FormValidationError) {
      return NextResponse.json(
        { error: "Validation failed", issues: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof WorkspaceFormAlreadySubmittedError) {
      return NextResponse.json(
        { error: "Form has already been submitted" },
        { status: 409 }
      );
    }
    console.error("[workspace] failed to submit form", error);
    return NextResponse.json(
      { error: "Could not submit workspace form" },
      { status: 500 }
    );
  }
}
