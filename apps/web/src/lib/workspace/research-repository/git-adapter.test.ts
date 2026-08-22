import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  request: vi.fn(),
  getHead: vi.fn(),
  createOctokit: vi.fn(),
}));

vi.mock("./github-app", () => ({
  createGithubInstallationOctokit: harness.createOctokit,
  getGithubRepositoryBranchHead: harness.getHead,
}));

import {
  commitArtifactBlobs,
  GITHUB_RESEARCH_APP_COMMITTER,
  listRepositoryArtifactRefs,
  StaleRepositoryError,
} from "./git-adapter";

const repository = { owner: "octocat", name: "private" };
const baseSha = "a".repeat(40);
const baseTreeSha = "b".repeat(40);
const blobSha = "c".repeat(40);
const treeSha = "d".repeat(40);
const commitSha = "e".repeat(40);

describe("GitHub repository Git Data adapter", () => {
  beforeEach(() => {
    for (const method of Object.values(harness)) method.mockReset();
    harness.createOctokit.mockReturnValue({ request: harness.request });
    harness.getHead.mockResolvedValue(baseSha);
  });

  it("creates blob, tree, commit, and a non-forced CAS ref update", async () => {
    harness.request.mockImplementation(async (route: string) => {
      if (route === "GET /repos/{owner}/{repo}/git/commits/{commit_sha}") {
        return { data: { tree: { sha: baseTreeSha } } };
      }
      if (route === "POST /repos/{owner}/{repo}/git/blobs") {
        return { data: { sha: blobSha } };
      }
      if (route === "POST /repos/{owner}/{repo}/git/trees") {
        return { data: { sha: treeSha } };
      }
      if (route === "POST /repos/{owner}/{repo}/git/commits") {
        return { data: { sha: commitSha } };
      }
      if (route === "PATCH /repos/{owner}/{repo}/git/refs/{ref}") {
        return { data: {} };
      }
      throw new Error(`Unexpected route ${route}`);
    });

    await expect(
      commitArtifactBlobs(99, repository, "evaluchat/workspace", {
        authorUser: { name: "Researcher", email: "r@example.test" },
        message: "Update index",
        baseSha,
        files: [{ path: "index.md", content: "# Updated\n" }],
      })
    ).resolves.toBe(commitSha);

    expect(harness.request).toHaveBeenCalledWith(
      "POST /repos/{owner}/{repo}/git/trees",
      expect.objectContaining({
        base_tree: baseTreeSha,
        tree: [
          { path: "index.md", mode: "100644", type: "blob", sha: blobSha },
        ],
      })
    );
    expect(harness.request).toHaveBeenCalledWith(
      "POST /repos/{owner}/{repo}/git/commits",
      expect.objectContaining({
        tree: treeSha,
        parents: [baseSha],
        author: { name: "Researcher", email: "r@example.test" },
        committer: GITHUB_RESEARCH_APP_COMMITTER,
      })
    );
    expect(harness.request).toHaveBeenCalledWith(
      "PATCH /repos/{owner}/{repo}/git/refs/{ref}",
      expect.objectContaining({
        ref: "heads/evaluchat/workspace",
        sha: commitSha,
        force: false,
      })
    );
  });

  it("rejects a stale base before creating blobs", async () => {
    const currentHead = "f".repeat(40);
    harness.getHead.mockResolvedValue(currentHead);

    await expect(
      commitArtifactBlobs(99, repository, "evaluchat/workspace", {
        message: "Update index",
        baseSha,
        files: [{ path: "index.md", content: "# Updated\n" }],
      })
    ).rejects.toMatchObject<Partial<StaleRepositoryError>>({
      currentHeadCommitSha: currentHead,
    });
    expect(harness.request).not.toHaveBeenCalled();
  });

  it("maps a non-fast-forward 422 to the refreshed current head", async () => {
    const refreshedHead = "f".repeat(40);
    harness.getHead
      .mockResolvedValueOnce(baseSha)
      .mockResolvedValue(refreshedHead);
    harness.request.mockImplementation(async (route: string) => {
      if (route === "GET /repos/{owner}/{repo}/git/commits/{commit_sha}") {
        return { data: { tree: { sha: baseTreeSha } } };
      }
      if (route === "POST /repos/{owner}/{repo}/git/blobs") {
        return { data: { sha: blobSha } };
      }
      if (route === "POST /repos/{owner}/{repo}/git/trees") {
        return { data: { sha: treeSha } };
      }
      if (route === "POST /repos/{owner}/{repo}/git/commits") {
        return { data: { sha: commitSha } };
      }
      throw Object.assign(new Error("Update is not a fast forward"), {
        status: 422,
      });
    });

    await expect(
      commitArtifactBlobs(99, repository, "evaluchat/workspace", {
        message: "Update index",
        baseSha,
        files: [{ path: "index.md", content: "# Updated\n" }],
      })
    ).rejects.toMatchObject({ currentHeadCommitSha: refreshedHead });
  });

  it("walks the branch tree and reloads managed blob content", async () => {
    harness.request.mockImplementation(async (route: string) => {
      if (route === "GET /repos/{owner}/{repo}/git/commits/{commit_sha}") {
        return { data: { tree: { sha: baseTreeSha } } };
      }
      if (route === "GET /repos/{owner}/{repo}/git/trees/{tree_sha}") {
        return {
          data: {
            tree: [
              { path: "index.md", mode: "100644", type: "blob", sha: blobSha },
              {
                path: "unmanaged.txt",
                mode: "100644",
                type: "blob",
                sha: treeSha,
              },
            ],
          },
        };
      }
      if (route === "GET /repos/{owner}/{repo}/git/blobs/{file_sha}") {
        return {
          data: {
            content: Buffer.from("# Index\n").toString("base64"),
            encoding: "base64",
          },
        };
      }
      throw new Error(`Unexpected route ${route}`);
    });

    await expect(
      listRepositoryArtifactRefs(99, repository, "evaluchat/workspace")
    ).resolves.toMatchObject({
      commitSha: baseSha,
      artifacts: [
        {
          artifactId: "index",
          path: "index.md",
          commitSha: baseSha,
          blobSha,
        },
      ],
    });
    expect(harness.request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/git/blobs/{file_sha}",
      expect.objectContaining({ file_sha: blobSha })
    );
  });
});
