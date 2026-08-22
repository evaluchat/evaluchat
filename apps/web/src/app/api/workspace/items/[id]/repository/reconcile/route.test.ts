import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  enabled: vi.fn(),
  verifyUserAuthenticated: vi.fn(),
  getWorkspaceItem: vi.fn(),
  readCredentials: vi.fn(),
  updateHead: vi.fn(),
  getRepository: vi.fn(),
  listArtifacts: vi.fn(),
  claimOperation: vi.fn(),
  completeOperation: vi.fn(),
  failOperation: vi.fn(),
}));

vi.mock("@/lib/research-workspaces-enabled.server", () => ({
  isGithubResearchWorkspacesEnabled: harness.enabled,
}));
vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/store", () => ({
  getWorkspaceItem: harness.getWorkspaceItem,
  updateResearchRepositoryBindingHead: harness.updateHead,
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
vi.mock("@/lib/workspace/research-repository/operations", () => ({
  claimRepositoryOperation: harness.claimOperation,
  completeRepositoryOperation: harness.completeOperation,
  failRepositoryOperation: harness.failOperation,
}));

import { POST } from "./route";

const headCommitSha = "b".repeat(40);
const artifacts = [{ artifactId: "index", path: "index.md" }];
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
const operation = {
  operationId: "operation-reconcile",
  idempotencyKey: "reconcile-idempotency-key",
  status: "pending",
};

describe("POST repository reconcile", () => {
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
      artifacts,
      commitSha: headCommitSha,
    });
    harness.claimOperation.mockResolvedValue(operation);
    harness.updateHead.mockResolvedValue(undefined);
    harness.completeOperation.mockResolvedValue({
      ...operation,
      status: "succeeded",
      resultCommitSha: headCommitSha,
    });
  });

  it("returns 404 while the feature flag is off", async () => {
    harness.enabled.mockReturnValue(false);
    const response = await POST(new Request("http://localhost"), context);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(harness.verifyUserAuthenticated).not.toHaveBeenCalled();
  });

  it("reloads blobs, refreshes the binding head, and records reconcile", async () => {
    const response = await POST(new Request("http://localhost"), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(harness.listArtifacts).toHaveBeenCalledWith(
      99,
      { owner: "octocat", name: "private" },
      "evaluchat/workspace",
      "1.0"
    );
    expect(harness.claimOperation).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        workspaceId: "workspace-one",
        kind: "reconcile",
        artifactIds: ["index"],
      })
    );
    expect(harness.updateHead).toHaveBeenCalledWith(
      "user-1",
      "workspace-one",
      headCommitSha
    );
    expect(harness.completeOperation).toHaveBeenCalledWith(
      "user-1",
      operation,
      headCommitSha
    );
    expect(await response.json()).toMatchObject({
      status: {
        state: "ready",
        headCommitSha,
      },
      artifacts,
    });
  });
});
