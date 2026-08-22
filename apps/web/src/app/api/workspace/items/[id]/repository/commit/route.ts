import { NextResponse } from "next/server";
import { isGithubResearchWorkspacesEnabled } from "@/lib/research-workspaces-enabled.server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import {
  getWorkspaceItem,
  updateResearchRepositoryBindingHead,
} from "@/lib/workspace/store";
import { getGithubInstallationRepository } from "@/lib/workspace/research-repository/github-app";
import { readGithubResearchCredentials } from "@/lib/workspace/research-repository/credentials";
import {
  commitArtifactBlobs,
  StaleRepositoryError,
} from "@/lib/workspace/research-repository/git-adapter";
import {
  RepositoryLayoutError,
  resolveRepositoryArtifactPath,
  validateRepositoryArtifactContent,
} from "@/lib/workspace/research-repository/layout";
import {
  claimRepositoryOperation,
  completeRepositoryOperation,
  failRepositoryOperation,
  RepositoryOperationInProgressError,
} from "@/lib/workspace/research-repository/operations";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function requestBody(value: unknown):
  | {
      artifactId: string;
      baseCommitSha: string;
      content: string;
      commitMessage: string;
      idempotencyKey: string;
    }
  | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const body = value as Record<string, unknown>;
  if (
    typeof body.artifactId !== "string" ||
    typeof body.baseCommitSha !== "string" ||
    !/^[0-9a-f]{40}$/.test(body.baseCommitSha) ||
    typeof body.content !== "string" ||
    typeof body.commitMessage !== "string" ||
    !body.commitMessage.trim() ||
    body.commitMessage.length > 500 ||
    typeof body.idempotencyKey !== "string" ||
    body.idempotencyKey.length < 16 ||
    body.idempotencyKey.length > 200
  ) {
    return;
  }
  return {
    artifactId: body.artifactId,
    baseCommitSha: body.baseCommitSha,
    content: body.content,
    commitMessage: body.commitMessage,
    idempotencyKey: body.idempotencyKey,
  };
}

export async function POST(request: Request, context: RouteContext) {
  if (!isGithubResearchWorkspacesEnabled()) {
    return json({ error: "Not found" }, 404);
  }
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) return json({ error: "Unauthorized" }, 401);

  let unparsed: unknown;
  try {
    unparsed = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  const body = requestBody(unparsed);
  if (!body) return json({ error: "Invalid request body" }, 400);

  const { id } = await context.params;
  const item = await getWorkspaceItem(auth.user.id, id);
  if (!item || item.kind !== "research_repository") {
    return json({ error: "Research repository not found" }, 404);
  }

  let artifact;
  try {
    artifact = resolveRepositoryArtifactPath(
      body.artifactId,
      item.binding.layoutVersion
    );
    validateRepositoryArtifactContent(artifact.path, body.content);
  } catch (error) {
    if (error instanceof RepositoryLayoutError) {
      return json(
        { error: error.code.toLowerCase() },
        error.code === "ARTIFACT_TOO_LARGE" ? 413 : 400
      );
    }
    throw error;
  }

  let operation;
  try {
    operation = await claimRepositoryOperation(auth.user.id, {
      workspaceId: item.id,
      kind: "commit",
      idempotencyKey: body.idempotencyKey,
      artifactIds: [artifact.artifactId],
      baseCommitSha: body.baseCommitSha,
    });
  } catch (error) {
    if (error instanceof RepositoryOperationInProgressError) {
      return json({ error: "repository_operation_in_progress" }, 409);
    }
    console.error(
      "[github-research] failed to claim repository operation",
      error
    );
    return json({ error: "Could not commit repository artifact" }, 500);
  }

  if (operation.status === "succeeded") {
    return json({
      operationId: operation.operationId,
      commitSha: operation.resultCommitSha,
    });
  }

  let credentials;
  try {
    credentials = await readGithubResearchCredentials(auth.user.id);
  } catch (error) {
    try {
      await failRepositoryOperation(
        auth.user.id,
        operation,
        "CREDENTIAL_READ_FAILED"
      );
    } catch {
      // Preserve the credential failure as the response cause.
    }
    console.error(
      "[github-research] failed to read repository credentials",
      error
    );
    return json({ error: "Could not authorize research repository" }, 500);
  }
  if (
    !credentials ||
    credentials.installationId !== item.binding.installationId ||
    !credentials.repositoryIds.includes(item.binding.repositoryId)
  ) {
    try {
      await failRepositoryOperation(
        auth.user.id,
        operation,
        "REPOSITORY_DISCONNECTED"
      );
    } catch {
      // The disconnected response is still authoritative.
    }
    return json({ error: "Research repository is disconnected" }, 409);
  }

  let commitSha: string;
  try {
    const repository = await getGithubInstallationRepository(
      item.binding.installationId,
      item.binding.repositoryId
    );
    const metadata = credentials.displayMetadata;
    const githubLogin =
      typeof metadata.login === "string" ? metadata.login : undefined;
    const githubUserId =
      typeof metadata.githubUserId === "number"
        ? metadata.githubUserId
        : undefined;
    const authorUser =
      githubLogin && githubUserId
        ? {
            name: githubLogin,
            email: `${githubUserId}+${githubLogin}@users.noreply.github.com`,
          }
        : undefined;
    commitSha = await commitArtifactBlobs(
      item.binding.installationId,
      repository,
      item.binding.branch,
      {
        authorUser,
        message: body.commitMessage,
        baseSha: body.baseCommitSha,
        files: [{ path: artifact.path, content: body.content }],
      }
    );
  } catch (error) {
    const stale = error instanceof StaleRepositoryError;
    try {
      await failRepositoryOperation(
        auth.user.id,
        operation,
        stale ? "STALE_REPOSITORY" : "COMMIT_FAILED"
      );
    } catch (storeError) {
      console.error(
        "[github-research] failed to record commit failure",
        storeError
      );
    }
    if (stale) {
      return json(
        {
          error: "stale_repository",
          currentHeadCommitSha: error.currentHeadCommitSha,
        },
        409
      );
    }
    console.error(
      "[github-research] failed to commit repository artifact",
      error
    );
    return json({ error: "Could not commit repository artifact" }, 500);
  }

  try {
    const completed = await completeRepositoryOperation(
      auth.user.id,
      operation,
      commitSha
    );
    await updateResearchRepositoryBindingHead(auth.user.id, item.id, commitSha);
    return json({ operationId: completed.operationId, commitSha });
  } catch (error) {
    console.error("[github-research] failed to persist commit result", error);
    return json({ error: "Could not record repository commit" }, 500);
  }
}
