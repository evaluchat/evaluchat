import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const items = new Map<string, unknown>();
  const key = (namespace: string[], itemKey: string) =>
    `${namespace.join("/")}:${itemKey}`;
  const store = {
    getItem: vi.fn(async (namespace: string[], itemKey: string) => {
      const value = items.get(key(namespace, itemKey));
      return value === undefined ? undefined : { value };
    }),
    putItem: vi.fn(
      async (namespace: string[], itemKey: string, value: unknown) => {
        items.set(key(namespace, itemKey), structuredClone(value));
      }
    ),
  };
  return { items, store, Client: vi.fn(() => ({ store })) };
});

vi.mock("@langchain/langgraph-sdk", () => ({ Client: harness.Client }));
vi.mock("@/constants", () => ({ LANGGRAPH_API_URL: "http://langgraph" }));

import {
  claimRepositoryOperation,
  completeRepositoryOperation,
  RepositoryOperationInProgressError,
  repositoryOperationsNamespace,
} from "./operations";

const baseCommitSha = "a".repeat(40);
const resultCommitSha = "b".repeat(40);
const claim = {
  workspaceId: "workspace-one",
  kind: "commit" as const,
  idempotencyKey: "idempotency-key-0001",
  artifactIds: ["index"],
  baseCommitSha,
};

describe("repository operation Store", () => {
  beforeEach(() => {
    harness.items.clear();
    for (const method of Object.values(harness.store)) method.mockClear();
  });

  it("stores operations in the per-user namespace without file text", async () => {
    await claimRepositoryOperation("user-1", {
      ...claim,
      content: "must never be retained",
      path: "index.md",
      commitMessage: "must never be retained",
    } as typeof claim);

    expect(repositoryOperationsNamespace("user-1")).toEqual([
      "github_research_operations",
      "user-1",
    ]);
    const stored = JSON.stringify([...harness.items.values()]);
    expect(stored).not.toContain("must never be retained");
    expect(stored).not.toContain("index.md");
  });

  it("replays a succeeded idempotency key with the original result", async () => {
    const pending = await claimRepositoryOperation("user-1", claim);
    const completed = await completeRepositoryOperation(
      "user-1",
      pending,
      resultCommitSha
    );

    await expect(claimRepositoryOperation("user-1", claim)).resolves.toEqual(
      completed
    );
    expect(harness.items).toHaveLength(1);
  });

  it("serializes concurrent same-key claims to one operation record", async () => {
    const results = await Promise.allSettled([
      claimRepositoryOperation("user-1", claim),
      claimRepositoryOperation("user-1", claim),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    expect(rejected?.reason).toBeInstanceOf(RepositoryOperationInProgressError);
    expect(harness.items).toHaveLength(1);
    expect(harness.store.putItem).toHaveBeenCalledTimes(1);
  });
});
