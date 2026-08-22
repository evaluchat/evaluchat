import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  type Item = {
    namespace: string[];
    key: string;
    value: Record<string, unknown>;
  };
  const items = new Map<string, Item>();
  const fullKey = (namespace: string[], key: string) =>
    `${namespace.join("/")}:${key}`;
  const store = {
    putItem: vi.fn(
      async (
        namespace: string[],
        key: string,
        value: Record<string, unknown>
      ) => {
        items.set(fullKey(namespace, key), { namespace, key, value });
      }
    ),
    getItem: vi.fn(async (namespace: string[], key: string) => {
      return items.get(fullKey(namespace, key)) ?? null;
    }),
    deleteItem: vi.fn(async (namespace: string[], key: string) => {
      items.delete(fullKey(namespace, key));
    }),
    searchItems: vi.fn(
      async (
        prefix: string[],
        options?: { filter?: Record<string, unknown> }
      ) => ({
        items: [...items.values()].filter(
          (item) =>
            prefix.every((part, index) => item.namespace[index] === part) &&
            Object.entries(options?.filter ?? {}).every(
              ([key, value]) => item.value[key] === value
            )
        ),
      })
    ),
  };
  return { items, store, Client: vi.fn(() => ({ store })) };
});

vi.mock("@langchain/langgraph-sdk", () => ({ Client: harness.Client }));
vi.mock("@/constants", () => ({ LANGGRAPH_API_URL: "http://langgraph" }));

import {
  claimGithubWebhookDelivery,
  consumeGithubOAuthState,
  deleteGithubResearchCredentials,
  findGithubCredentialOwnersByInstallationId,
  githubResearchCredentialsNamespace,
  readGithubResearchCredentials,
  storeGithubOAuthState,
  storeGithubResearchCredentials,
  updateGithubInstallationRepositories,
} from "./credentials";

const KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

beforeEach(() => {
  vi.stubEnv("GITHUB_RESEARCH_TOKEN_ENCRYPTION_KEY", KEY);
  harness.items.clear();
  for (const method of Object.values(harness.store)) method.mockClear();
});

describe("GitHub research credential Store", () => {
  it("uses the per-user credential namespace", () => {
    expect(githubResearchCredentialsNamespace("user-1")).toEqual([
      "github_research_credentials",
      "user-1",
    ]);
  });

  it("stores an encrypted, one-time OAuth state tied to the user", async () => {
    await storeGithubOAuthState("user-1", "state-value", "v".repeat(43));
    expect(JSON.stringify([...harness.items.values()])).not.toContain(
      "v".repeat(43)
    );

    await expect(
      consumeGithubOAuthState("user-2", "state-value")
    ).resolves.toBeNull();
    await expect(
      consumeGithubOAuthState("user-1", "state-value")
    ).resolves.toBe("v".repeat(43));
    await expect(
      consumeGithubOAuthState("user-1", "state-value")
    ).resolves.toBeNull();
  });

  it("encrypts tokens and display metadata, then decrypts them on read", async () => {
    await storeGithubResearchCredentials("user-1", {
      tokens: {
        accessToken: "ghu_access-secret",
        refreshToken: "ghr_refresh-secret",
      },
      installationId: 99,
      repositoryIds: [102, 101, 101],
      displayMetadata: { githubUserId: 7, login: "private-login" },
      oauthCode: "one-time-code",
    });
    const stored = JSON.stringify([...harness.items.values()]);
    expect(stored).not.toContain("ghu_access-secret");
    expect(stored).not.toContain("ghr_refresh-secret");
    expect(stored).not.toContain("private-login");
    expect(stored).not.toContain("one-time-code");

    await expect(readGithubResearchCredentials("user-1")).resolves.toEqual({
      tokens: {
        accessToken: "ghu_access-secret",
        refreshToken: "ghr_refresh-secret",
      },
      installationId: 99,
      repositoryIds: [101, 102],
      displayMetadata: { githubUserId: 7, login: "private-login" },
    });
    await expect(
      findGithubCredentialOwnersByInstallationId(99)
    ).resolves.toEqual(["user-1"]);
  });

  it("deduplicates webhook deliveries by a stored hash", async () => {
    await expect(
      claimGithubWebhookDelivery("user-1", "delivery-1")
    ).resolves.toBe(true);
    await expect(
      claimGithubWebhookDelivery("user-1", "delivery-1")
    ).resolves.toBe(false);
    expect(JSON.stringify([...harness.items.values()])).not.toContain(
      "delivery-1"
    );
  });

  it("updates repository ids without storing repository names", async () => {
    await storeGithubResearchCredentials("user-1", {
      tokens: { accessToken: "ghu_access" },
      installationId: 99,
      repositoryIds: [101],
      displayMetadata: { githubUserId: 7 },
    });
    await updateGithubInstallationRepositories("user-1", [102], [101]);
    expect(
      (await readGithubResearchCredentials("user-1"))?.repositoryIds
    ).toEqual([102]);
  });

  it("deletes the credentials item on disconnect", async () => {
    await storeGithubResearchCredentials("user-1", {
      tokens: { accessToken: "ghu_access" },
      repositoryIds: [],
      displayMetadata: { githubUserId: 7 },
    });
    await deleteGithubResearchCredentials("user-1");
    await expect(readGithubResearchCredentials("user-1")).resolves.toBeNull();
  });
});
