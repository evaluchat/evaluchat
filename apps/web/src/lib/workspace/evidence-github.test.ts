import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ledgerBranch, openEvidencePullRequest } from "./evidence-github";

const input = (stage = "documented-experience") => ({
  methodId: "ai-assisted-essay",
  stage,
  timestampSlug: "2026-08-18T12-34-56Z",
  filePath: "methods/ai-assisted-essay/evidence/2026-08-18T12-34-56Z.en.md",
  markdown: "---\ntype: Evidence Contribution\n---\n",
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("openEvidencePullRequest", () => {
  beforeEach(() => {
    process.env.VALERY_GITHUB_TOKEN = "test-token";
    process.env.EVIDENCE_GITHUB_CHECK_ATTEMPTS = "1";
    process.env.EVIDENCE_GITHUB_CHECK_INTERVAL_MS = "0";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.VALERY_GITHUB_TOKEN;
    delete process.env.EVIDENCE_GITHUB_CHECK_ATTEMPTS;
    delete process.env.EVIDENCE_GITHUB_CHECK_INTERVAL_MS;
  });

  it("creates the branch and file, waits for lint, and merges a documented experience", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({ object: { sha: "base-sha" } }))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(
        response({
          number: 42,
          html_url: "https://github.com/evaluchat/research/pull/42",
          head: { sha: "head-sha" },
        })
      )
      .mockResolvedValueOnce(
        response({ check_runs: [{ name: "okf-lint", conclusion: "success" }] })
      )
      .mockResolvedValueOnce(response({ merged: true }));

    const result = await openEvidencePullRequest(input());

    expect(result).toMatchObject({
      number: 42,
      url: "https://github.com/evaluchat/research/pull/42",
      status: "filed",
      lintConclusion: "success",
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      signal: expect.any(AbortSignal),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/git/refs");
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: "PUT" });
    expect(fetchMock.mock.calls[4]?.[0]).toContain("check-runs");
    expect(fetchMock.mock.calls[5]?.[0]).toContain("/pulls/42/merge");
    expect(
      JSON.parse(String(fetchMock.mock.calls[5]?.[1]?.body))
    ).toMatchObject({
      sha: "head-sha",
    });
  });

  it("routes higher stages to human review without checking or merging", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({ object: { sha: "base-sha" } }))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(
        response({
          number: 43,
          html_url: "https://github.com/evaluchat/research/pull/43",
          head: { sha: "head-sha" },
        })
      )
      .mockResolvedValueOnce(response({}));

    const result = await openEvidencePullRequest(
      input("structured-experiment")
    );

    expect(result).toMatchObject({ number: 43, status: "submitted" });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls[4]?.[0]).toContain("/issues/43/comments");
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("check-runs"))
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith("/merge"))
    ).toBe(false);
  });

  it("does not merge when okf-lint fails", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({ object: { sha: "base-sha" } }))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(
        response({
          number: 44,
          html_url: "https://github.com/evaluchat/research/pull/44",
          head: { sha: "head-sha" },
        })
      )
      .mockResolvedValueOnce(
        response({ check_runs: [{ name: "okf-lint", conclusion: "failure" }] })
      );

    const result = await openEvidencePullRequest(input());

    expect(result).toMatchObject({
      number: 44,
      status: "submitted",
      lintConclusion: "failure",
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith("/merge"))
    ).toBe(false);
  });

  it("reuses an existing pull request on retry (no duplicate branch/file/pr)", async () => {
    const existing = {
      branch: "evidence/ai-assisted-essay/2026-08-18T12-34-56Z",
      number: 90,
      url: "https://github.com/evaluchat/research/pull/90",
      headSha: "existing-head-sha",
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      // Reuse path: no branch-create, no file-PUT, no PR-create calls.
      // Only the okf-lint check + merge.
      .mockResolvedValueOnce(
        response({ check_runs: [{ name: "okf-lint", conclusion: "success" }] })
      )
      .mockResolvedValueOnce(response({ merged: true }));

    const result = await openEvidencePullRequest({
      ...input(),
      existingPullRequest: existing,
    });

    expect(result).toMatchObject({
      number: 90,
      url: "https://github.com/evaluchat/research/pull/90",
      status: "filed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Must NOT have created a branch/ref, PUT the file, or POSTed a new PR.
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/git/refs"))
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/contents/"))
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith("/pulls"))
    ).toBe(false);
    // Merge bound to the reused PR's head SHA.
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    ).toMatchObject({
      sha: "existing-head-sha",
    });
  });

  it("uses the existing pull request but routes to human review above documented-experience", async () => {
    const existing = {
      branch: "evidence/ai-assisted-essay/2026-08-18T12-34-56Z",
      number: 91,
      url: "https://github.com/evaluchat/research/pull/91",
      headSha: "existing-head-sha",
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({})); // human-review comment only

    const result = await openEvidencePullRequest({
      ...input("structured-experiment"),
      existingPullRequest: existing,
    });

    expect(result).toMatchObject({ number: 91, status: "submitted" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/issues/91/comments");
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("check-runs"))
    ).toBe(false);
  });
});

describe("ledgerBranch", () => {
  const base = {
    ledgerId: "ledger_demo",
    inputFingerprint: "sha256:abcdef0123456789ffff",
    filePath: "evidence-ledgers/ledger_demo.en.md",
    markdown: "---\n",
    body: "body",
  };

  it("keeps the initial branch unsuffixed and uses a distinct retry suffix each time", () => {
    expect(ledgerBranch(base)).toBe("ledger/ledger_demo-abcdef012345");
    expect(ledgerBranch({ ...base, retry: 2 })).toBe(
      "ledger/ledger_demo-abcdef012345-retry-2"
    );
    expect(ledgerBranch({ ...base, retry: 3 })).toBe(
      "ledger/ledger_demo-abcdef012345-retry-3"
    );
    expect(ledgerBranch({ ...base, retry: 2 })).not.toBe(
      ledgerBranch({ ...base, retry: 3 })
    );
  });
});
