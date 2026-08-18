import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openEvidencePullRequest } from "./evidence-github";

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
    });
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/git/refs");
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: "PUT" });
    expect(fetchMock.mock.calls[4]?.[0]).toContain("check-runs");
    expect(fetchMock.mock.calls[5]?.[0]).toContain("/pulls/42/merge");
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
});
