import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import { FormValidationError } from "@/lib/workspace/form-validation";
import {
  ledgerRenderHash,
  renderLedgerMarkdown,
  validateLedgerPublicationDeclarations,
} from "@/lib/workspace/ledger-publish";
import {
  getGithubResearchWriteAccess,
  getLedgerPullRequestStatus,
  openLedgerPullRequest,
  RESEARCH_REPOSITORY,
} from "@/lib/workspace/evidence-github";
import {
  getLedgerSnapshotItem,
  updateLedgerSnapshotPublication,
  WorkspaceItemNotFoundError,
} from "@/lib/workspace/store";

type RouteContext = { params: Promise<{ id: string }> };

function publicationBody(input: {
  methodId: string;
  methodVersion: string;
  templateId: string;
  templateVersion: string;
  sourceCommit: string;
  inputFingerprint: string;
  buckets: Record<string, number>;
}): string {
  return [
    "## Evidence Ledger snapshot",
    "",
    `- Method: ${input.methodId}@${input.methodVersion}`,
    `- Evidence template: ${input.templateId}@${input.templateVersion}`,
    `- Source commit: ${input.sourceCommit}`,
    `- Input fingerprint: ${input.inputFingerprint}`,
    "- Bucket counts:",
    ...Object.entries(input.buckets)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([bucket, count]) => `  - ${bucket}: ${count}`),
    "",
    "Human review required before merge.",
  ].join("\n");
}

function filePath(ledgerId: string, methodId: string): string {
  return `methods/${methodId}/evidence/ledgers/${ledgerId}.en.md`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Serve the one-file, read-only publish preview without creating any GitHub state. */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    const item = await getLedgerSnapshotItem(auth.user.id, id);
    const computedHash = ledgerRenderHash(item.snapshot, item.config);
    const snapshot =
      item.snapshot.renderHash === computedHash
        ? item.snapshot
        : { ...item.snapshot, renderHash: computedHash };
    return NextResponse.json({
      filePath: filePath(snapshot.ledgerId, snapshot.methodId),
      markdown: renderLedgerMarkdown(snapshot, item.config),
      destination: RESEARCH_REPOSITORY,
    });
  } catch (error) {
    if (error instanceof WorkspaceItemNotFoundError) {
      return NextResponse.json(
        { error: "Ledger snapshot not found" },
        { status: 404 }
      );
    }
    console.error("[workspace] failed to preview ledger publication", error);
    return NextResponse.json(
      { error: "Could not preview ledger publication" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) throw new Error("invalid");
    body = parsed;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { id } = await context.params;
  try {
    let item = await getLedgerSnapshotItem(auth.user.id, id);
    const rePublish = body.rePublish === true;
    if (item.publication && !rePublish) {
      return NextResponse.json(
        {
          error: "Ledger snapshot already has a publication pull request",
          publication: item.publication,
        },
        { status: 409 }
      );
    }

    // This uses the exact token-backed identity that would create the branch.
    // It deliberately precedes every write operation in openLedgerPullRequest.
    const access = await getGithubResearchWriteAccess();
    if (!access.allowed) {
      if (access.reason === "missing_identity") {
        return NextResponse.json(
          {
            error: "The publication service is not configured",
            reason: access.reason,
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          error:
            "Your connected GitHub account needs collaborator write access to evaluchat/research before a ledger can be published.",
          reason: access.reason,
        },
        { status: 403 }
      );
    }

    let retry: number | undefined;
    if (item.publication && rePublish) {
      if (!item.publication.pullRequestNumber) {
        return NextResponse.json(
          { error: "The recorded ledger pull request is incomplete" },
          { status: 409 }
        );
      }
      const previous = await getLedgerPullRequestStatus(
        item.publication.pullRequestNumber
      );
      if (previous.merged || previous.state !== "closed") {
        return NextResponse.json(
          {
            error:
              "Only a closed, unmerged ledger pull request can be republished.",
            publication: item.publication,
          },
          { status: 409 }
        );
      }
      retry = Date.now();
    }

    // The same validator used by evidence submission verifies both required
    // owner declarations before any branch, commit, or PR is created.
    validateLedgerPublicationDeclarations(item.snapshot, body.values);

    const computedHash = ledgerRenderHash(item.snapshot, item.config);
    if (item.snapshot.renderHash !== computedHash) {
      item = await updateLedgerSnapshotPublication(auth.user.id, id, {
        renderHash: computedHash,
      });
    }
    const markdown = renderLedgerMarkdown(item.snapshot, item.config);
    const pullRequest = await openLedgerPullRequest({
      ledgerId: item.snapshot.ledgerId,
      inputFingerprint: item.snapshot.inputFingerprint,
      filePath: filePath(item.snapshot.ledgerId, item.snapshot.methodId),
      markdown,
      body: publicationBody(item.snapshot),
      ...(retry ? { retry } : {}),
    });
    const publication = {
      status: "draft" as const,
      pullRequestUrl: pullRequest.url,
      pullRequestNumber: pullRequest.number,
    };
    await updateLedgerSnapshotPublication(auth.user.id, id, { publication });
    return NextResponse.json({
      publication,
      pullRequestUrl: pullRequest.url,
      filePath: filePath(item.snapshot.ledgerId, item.snapshot.methodId),
      lintConclusion: pullRequest.lintConclusion,
    });
  } catch (error) {
    if (error instanceof WorkspaceItemNotFoundError) {
      return NextResponse.json(
        { error: "Ledger snapshot not found" },
        { status: 404 }
      );
    }
    if (error instanceof FormValidationError) {
      return NextResponse.json(
        { error: "Validation failed", issues: error.issues },
        { status: 422 }
      );
    }
    console.error("[workspace] failed to publish ledger snapshot", error);
    return NextResponse.json(
      { error: "Could not create ledger publication pull request" },
      { status: 502 }
    );
  }
}
