import { NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import {
  getEvidenceSnapshot,
  WorkspaceItemNotFoundError,
  WorkspaceThreadOwnershipError,
} from "@/lib/workspace/store";

type RouteContext = { params: Promise<{ id: string; threadId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, threadId } = await context.params;
  try {
    const result = await getEvidenceSnapshot(auth.user.id, id, threadId);
    return NextResponse.json({
      threadId,
      status: result.reference.status,
      pullRequestUrl: result.reference.pullRequestUrl,
      pullRequestNumber: result.reference.pullRequestNumber,
      template: {
        id: result.snapshot.templateId,
        version: result.snapshot.templateVersion,
        defaultStage: result.snapshot.defaultStage,
        sourcePath: result.snapshot.sourcePath,
        fields: result.snapshot.fields,
        layoutMarkdown: result.snapshot.layoutMarkdown,
        guidance: result.snapshot.guidance,
      },
      fields: result.snapshot.fields,
      layoutMarkdown: result.snapshot.layoutMarkdown,
      guidance: result.snapshot.guidance,
      frozenValues: result.snapshot.frozenValues,
      method: {
        id: result.snapshot.methodId,
        version: result.snapshot.methodVersion,
      },
    });
  } catch (error) {
    if (error instanceof WorkspaceItemNotFoundError) {
      return NextResponse.json(
        { error: "Evidence not found" },
        { status: 404 }
      );
    }
    if (error instanceof WorkspaceThreadOwnershipError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[workspace] failed to load evidence snapshot", error);
    return NextResponse.json(
      { error: "Could not load evidence snapshot" },
      { status: 500 }
    );
  }
}
