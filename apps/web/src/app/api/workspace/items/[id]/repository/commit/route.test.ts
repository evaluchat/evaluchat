import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  class StaleRepositoryError extends Error {
    constructor(public readonly currentHeadCommitSha: string) {
      super("stale");
    }
  }
  class RepositoryOperationInProgressError extends Error {}
  return {
    StaleRepositoryError,
    RepositoryOperationInProgressError,
    enabled: vi.fn(),
    verifyUserAuthenticated: vi.fn(),
    getWorkspaceItem: vi.fn(),
    readCredentials: vi.fn(),
    updateHead: vi.fn(),
    getRepository: vi.fn(),
    commitArtifacts: vi.fn(),
    claimOperation: vi.fn(),
    completeOperation: vi.fn(),
    failOperation: vi.fn(),
  };
});

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
  commitArtifactBlobs: harness.commitArtifacts,
  StaleRepositoryError: harness.StaleRepositoryError,
}));
vi.mock("@/lib/workspace/research-repository/operations", () => ({
  claimRepositoryOperation: harness.claimOperation,
  completeRepositoryOperation: harness.completeOperation,
  failRepositoryOperation: harness.failOperation,
  RepositoryOperationInProgressError:
    harness.RepositoryOperationInProgressError,
}));

import { POST } from "./route";

const baseCommitSha = "a".repeat(40);
const resultCommitSha = "b".repeat(40);
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
const pendingOperation = {
  operationId: "operation-one",
  workspaceId: "workspace-one",
  kind: "commit",
  idempotencyKey: "idempotency-key-0001",
  status: "pending",
  artifactIds: ["index"],
  baseCommitSha,
  createdAt: "2026-08-22T10:00:00.000Z",
  updatedAt: "2026-08-22T10:00:00.000Z",
};
const succeededOperation = {
  ...pendingOperation,
  status: "succeeded",
  resultCommitSha,
};

function request() {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      artifactId: "index",
      baseCommitSha,
      content: "unique file text that must not enter Store",
      commitMessage: "Update index",
      idempotencyKey: "idempotency-key-0001",
    }),
  });
}

describe("POST repository artifact commit", () => {
  beforeEach(() => {
    for (const value of Object.values(harness)) {
      if (typeof value === "function" && "mockReset" in value) {
        (value as ReturnType<typeof vi.fn>).mockReset();
      }
    }
    harness.enabled.mockReturnValue(true);
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: {
        id: "user-1",
        email: "researcher@example.test",
        user_metadata: { full_name: "Researcher" },
      },
    });
    harness.getWorkspaceItem.mockResolvedValue(item);
    harness.readCredentials.mockResolvedValue({
      installationId: 99,
      repositoryIds: [101],
      displayMetadata: { githubUserId: 7, login: "researcher" },
    });
    harness.getRepository.mockResolvedValue({
      owner: "octocat",
      name: "private",
    });
    harness.claimOperation.mockResolvedValue(pendingOperation);
    harness.commitArtifacts.mockResolvedValue(resultCommitSha);
    harness.completeOperation.mockResolvedValue(succeededOperation);
    harness.updateHead.mockResolvedValue(undefined);
  });

  it("returns 404 while the feature flag is off", async () => {
    harness.enabled.mockReturnValue(false);
    const response = await POST(request(), context);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(harness.verifyUserAuthenticated).not.toHaveBeenCalled();
  });

  it("replays a completed key without a second GitHub commit", async () => {
    harness.claimOperation
      .mockResolvedValueOnce(pendingOperation)
      .mockResolvedValueOnce(succeededOperation);

    const first = await POST(request(), context);
    const second = await POST(request(), context);

    expect(await first.json()).toEqual({
      operationId: "operation-one",
      commitSha: resultCommitSha,
    });
    expect(await second.json()).toEqual({
      operationId: "operation-one",
      commitSha: resultCommitSha,
    });
    expect(harness.commitArtifacts).toHaveBeenCalledTimes(1);
    expect(harness.commitArtifacts).toHaveBeenCalledWith(
      99,
      { owner: "octocat", name: "private" },
      "evaluchat/workspace",
      expect.objectContaining({
        authorUser: {
          name: "researcher",
          email: "7+researcher@users.noreply.github.com",
        },
        baseSha: baseCommitSha,
        files: [
          {
            path: "index.md",
            content: "unique file text that must not enter Store",
          },
        ],
      })
    );
    const storeFacingCalls = JSON.stringify({
      claim: harness.claimOperation.mock.calls,
      complete: harness.completeOperation.mock.calls,
      fail: harness.failOperation.mock.calls,
      updateHead: harness.updateHead.mock.calls,
    });
    expect(storeFacingCalls).not.toContain("unique file text");
    expect(storeFacingCalls).not.toContain("Update index");
  });

  it("returns a stale conflict with the current remote head", async () => {
    const currentHeadCommitSha = "c".repeat(40);
    harness.commitArtifacts.mockRejectedValue(
      new harness.StaleRepositoryError(currentHeadCommitSha)
    );

    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "stale_repository",
      currentHeadCommitSha,
    });
    expect(harness.failOperation).toHaveBeenCalledWith(
      "user-1",
      pendingOperation,
      "STALE_REPOSITORY"
    );
  });
});
