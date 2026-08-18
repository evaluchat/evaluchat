import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import { FormValidationError } from "@/lib/workspace/form-validation";
import {
  assembleEvidenceMarkdown,
  evidenceFilePath,
  evidenceTimestampSlug,
  validateEvidenceSubmission,
} from "@/lib/workspace/evidence";
import { openEvidencePullRequest } from "@/lib/workspace/evidence-github";
import {
  getEvidenceSnapshot,
  updateEvidenceThreadReference,
  WorkspaceItemNotFoundError,
  WorkspaceThreadOwnershipError,
} from "@/lib/workspace/store";

type RouteContext = { params: Promise<{ id: string; threadId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, threadId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
  const rawValues =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).values
      : undefined;

  try {
    const loaded = await getEvidenceSnapshot(auth.user.id, id, threadId);
    if (loaded.reference.status === "filed") {
      return NextResponse.json(
        { error: "Evidence has already been filed" },
        { status: 409 }
      );
    }
    const validated = validateEvidenceSubmission(loaded.snapshot, rawValues);
    const generatedAt = new Date().toISOString();
    const timestampSlug = evidenceTimestampSlug(generatedAt);
    const markdown = assembleEvidenceMarkdown({
      snapshot: loaded.snapshot,
      values: validated.values,
      stage: validated.stage,
      generatedAt,
    });
    const filePath = evidenceFilePath(loaded.snapshot.methodId, timestampSlug);
    const pullRequest = await openEvidencePullRequest({
      methodId: loaded.snapshot.methodId,
      stage: validated.stage,
      timestampSlug,
      filePath,
      markdown,
    });
    await updateEvidenceThreadReference(auth.user.id, id, threadId, {
      status: pullRequest.status,
      submittedAt: generatedAt,
      pullRequestUrl: pullRequest.url,
      pullRequestNumber: pullRequest.number,
    });
    return NextResponse.json({
      status: pullRequest.status,
      pullRequestUrl: pullRequest.url,
      pullRequestNumber: pullRequest.number,
      filePath,
      id: timestampSlug,
      stage: validated.stage,
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
    if (error instanceof FormValidationError) {
      return NextResponse.json(
        { error: "Validation failed", issues: error.issues },
        { status: 400 }
      );
    }
    console.error("[workspace] failed to submit evidence", error);
    return NextResponse.json(
      { error: "Could not submit evidence" },
      { status: 502 }
    );
  }
}
