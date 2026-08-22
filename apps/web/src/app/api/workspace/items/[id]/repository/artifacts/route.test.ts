import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  enabled: vi.fn(),
  verifyUserAuthenticated: vi.fn(),
  getWorkspaceItem: vi.fn(),
  readCredentials: vi.fn(),
  getRepository: vi.fn(),
  listArtifacts: vi.fn(),
}));

vi.mock("@/lib/research-workspaces-enabled.server", () => ({
  isGithubResearchWorkspacesEnabled: harness.enabled,
}));
vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/store", () => ({
  getWorkspaceItem: harness.getWorkspaceItem,
}));
vi.mock("@/lib/workspace/research-repository/credentials", () => ({
  readGithubResearchCredentials: harness.readCredentials,
}));
vi.mock("@/lib/workspace/research-repository/github-app", () => ({
  getGithubInstallationRepository: harness.getRepository,
}));
vi.mock("@/lib/workspace/research-repository/git-adapter", () => ({
  listRepositoryArtifactRefs: harness.listArtifacts,
}));

import { GET } from "./route";
import { RepositoryLayoutError } from "@/lib/workspace/research-repository/layout";

const context = { params: Promise.resolve({ id: "workspace-one" }) };
const item = {
  id: "workspace-one",
  kind: "research_repository",
  binding: {
    installationId: 99,
    repositoryId: 101,
    branch: "evaluchat/workspace",
    layoutVersion: "1.0",
  },
};

describe("GET repository artifacts", () => {
  beforeEach(() => {
    for (const method of Object.values(harness)) method.mockReset();
    harness.enabled.mockReturnValue(true);
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.getWorkspaceItem.mockResolvedValue(item);
    harness.readCredentials.mockResolvedValue({
      installationId: 99,
      repositoryIds: [101],
    });
    harness.getRepository.mockResolvedValue({
      owner: "octocat",
      name: "private",
    });
    harness.listArtifacts.mockResolvedValue({
      artifacts: [{ artifactId: "index", path: "index.md" }],
      commitSha: "a".repeat(40),
    });
  });

  it("returns 404 before authentication while the flag is off", async () => {
    harness.enabled.mockReturnValue(false);
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(harness.verifyUserAuthenticated).not.toHaveBeenCalled();
  });

  it("lists managed refs with no-store caching", async () => {
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      artifacts: [{ artifactId: "index", path: "index.md" }],
      headCommitSha: "a".repeat(40),
    });
    expect(harness.listArtifacts).toHaveBeenCalledWith(
      99,
      { owner: "octocat", name: "private" },
      "evaluchat/workspace",
      "1.0"
    );
  });

  it("returns a redacted 4xx layout error without logging its path", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(vi.fn());
    harness.listArtifacts.mockRejectedValue(
      new RepositoryLayoutError(
        "SYMLINK_ARTIFACT",
        "unsafe private/path/notes.lnk"
      )
    );

    try {
      const response = await GET(new Request("http://localhost"), context);
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "SYMLINK_ARTIFACT" });
      expect(consoleError).toHaveBeenCalledWith(
        "[github-research] failed to list repository artifacts",
        { workspaceId: "workspace-one", code: "SYMLINK_ARTIFACT" }
      );
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
        "private/path"
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
