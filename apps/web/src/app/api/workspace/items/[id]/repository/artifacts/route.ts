import { NextResponse } from "next/server";
import { isGithubResearchWorkspacesEnabled } from "@/lib/research-workspaces-enabled.server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import { getWorkspaceItem } from "@/lib/workspace/store";
import { readGithubResearchCredentials } from "@/lib/workspace/research-repository/credentials";
import { getGithubInstallationRepository } from "@/lib/workspace/research-repository/github-app";
import { listRepositoryArtifactRefs } from "@/lib/workspace/research-repository/git-adapter";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(_request: Request, context: RouteContext) {
  if (!isGithubResearchWorkspacesEnabled()) {
    return json({ error: "Not found" }, 404);
  }
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) return json({ error: "Unauthorized" }, 401);

  const { id } = await context.params;
  const item = await getWorkspaceItem(auth.user.id, id);
  if (!item || item.kind !== "research_repository") {
    return json({ error: "Research repository not found" }, 404);
  }

  try {
    const credentials = await readGithubResearchCredentials(auth.user.id);
    if (
      !credentials ||
      credentials.installationId !== item.binding.installationId ||
      !credentials.repositoryIds.includes(item.binding.repositoryId)
    ) {
      return json({ error: "Research repository is disconnected" }, 409);
    }
    const repository = await getGithubInstallationRepository(
      item.binding.installationId,
      item.binding.repositoryId
    );
    const result = await listRepositoryArtifactRefs(
      item.binding.installationId,
      repository,
      item.binding.branch,
      item.binding.layoutVersion
    );
    return json({
      artifacts: result.artifacts,
      headCommitSha: result.commitSha,
    });
  } catch (error) {
    console.error(
      "[github-research] failed to list repository artifacts",
      error
    );
    return json({ error: "Could not load repository artifacts" }, 500);
  }
}
