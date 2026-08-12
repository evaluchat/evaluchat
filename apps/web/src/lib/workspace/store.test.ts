import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const state: {
    manifest: any;
    threads: Map<string, any>;
  } = { manifest: undefined, threads: new Map() };

  const client = {
    store: {
      getItem: vi.fn(async () =>
        state.manifest ? { value: structuredClone(state.manifest) } : undefined
      ),
      putItem: vi.fn(async (_namespace: string[], _key: string, value: any) => {
        state.manifest = structuredClone(value);
      }),
    },
    threads: {
      get: vi.fn(async (id: string) => {
        const thread = state.threads.get(id);
        if (thread) return thread;
        throw Object.assign(new Error("Not found"), { status: 404 });
      }),
      delete: vi.fn(async (id: string) => {
        if (!state.threads.has(id)) {
          throw Object.assign(new Error("Not found"), { status: 404 });
        }
        state.threads.delete(id);
      }),
    },
  };

  return { state, client, Client: vi.fn(() => client) };
});

vi.mock("@langchain/langgraph-sdk", () => ({ Client: harness.Client }));
vi.mock("@/constants", () => ({ LANGGRAPH_API_URL: "http://langgraph" }));

import {
  deleteWorkspaceItem,
  ensureDefaultWorkspaceItem,
  WorkspaceItemNotFoundError,
  WorkspaceThreadOwnershipError,
  reconcileWorkspaceItemThread,
} from "./store";

describe("workspace item lifecycle", () => {
  beforeEach(() => {
    harness.state.manifest = undefined;
    harness.state.threads.clear();
    vi.clearAllMocks();
  });

  it("cascades thread deletion, removes the manifest item, and clears default", async () => {
    const item = await ensureDefaultWorkspaceItem("user-1");
    expect(item).toBeDefined();
    harness.state.threads.set("thread-1", {
      metadata: { user_id: "user-1", workspace_item_id: item!.id },
    });
    await reconcileWorkspaceItemThread("user-1", item!.id, "thread-1");

    await deleteWorkspaceItem("user-1", item!.id);

    expect(harness.client.threads.delete).toHaveBeenCalledWith("thread-1");
    expect(harness.state.manifest.items[item!.id]).toBeUndefined();
    expect(harness.state.manifest.defaultItemId).toBeUndefined();
    expect(harness.state.manifest.initialized).toBe(true);
  });

  it("does not recreate the original item after explicit deletion", async () => {
    const item = await ensureDefaultWorkspaceItem("user-1");
    await deleteWorkspaceItem("user-1", item!.id);

    await expect(ensureDefaultWorkspaceItem("user-1")).resolves.toBeUndefined();
  });

  it("treats a missing thread as an idempotent cascade", async () => {
    const item = await ensureDefaultWorkspaceItem("user-1");
    harness.state.manifest.items[item!.id].threadId = "missing-thread";

    await expect(
      deleteWorkspaceItem("user-1", item!.id)
    ).resolves.toBeUndefined();
    expect(harness.state.manifest.items[item!.id]).toBeUndefined();
  });

  it("rejects a different user before changing the manifest", async () => {
    const item = await ensureDefaultWorkspaceItem("user-1");

    await expect(
      deleteWorkspaceItem("user-2", item!.id)
    ).rejects.toBeInstanceOf(WorkspaceItemNotFoundError);
    expect(harness.state.manifest.items[item!.id]).toBeDefined();
  });

  it("rejects a thread whose ownership markers do not match", async () => {
    const item = await ensureDefaultWorkspaceItem("user-1");
    harness.state.manifest.items[item!.id].threadId = "foreign-thread";
    harness.state.threads.set("foreign-thread", {
      metadata: { user_id: "user-2", workspace_item_id: item!.id },
    });

    await expect(
      deleteWorkspaceItem("user-1", item!.id)
    ).rejects.toBeInstanceOf(WorkspaceThreadOwnershipError);
    expect(harness.state.manifest.items[item!.id]).toBeDefined();
  });
});
