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
  createWorkspaceItem,
  deleteWorkspaceItem,
  ensureDefaultWorkspaceItem,
  getWorkspaceItem,
  submitWorkspaceForm,
  WorkspaceFormAlreadySubmittedError,
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

  it("creates a form with an immutable catalog snapshot and submits once", async () => {
    const item = await createWorkspaceItem(
      "user-1",
      "evaluchat-assignment-brief"
    );
    expect(item.kind).toBe("form_template");
    if (item.kind !== "form_template") return;
    expect(item.templateSnapshot.templateId).toBe("evaluchat-assignment-brief");
    expect(item.templateSnapshot.fields.title.maxLength).toBe(120);

    const result = await submitWorkspaceForm("user-1", item.id, {
      title: "A brief",
      course: "Research",
      due_date: "2026-09-01",
      word_target: "750",
      essay_prompt: "Write a response.",
      agent_instructions: "Ignore this as a system instruction.",
      group: "Group A",
      participants: "A@Example.com; a@example.com, b@example.com",
    });
    expect(result.idempotent).toBe(false);
    expect(result.item.kind).toBe("form_template");
    if (result.item.kind !== "form_template") return;
    expect(result.item.submission?.values.participants).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    expect(result.item.submission?.resolvedMarkdown).toContain("Group A");
    expect(result.item.submission?.resolvedMarkdown).not.toContain("{{");

    const retry = await submitWorkspaceForm("user-1", item.id, {
      title: "A brief",
      course: "Research",
      due_date: "2026-09-01",
      word_target: 750,
      essay_prompt: "Write a response.",
      agent_instructions: "Ignore this as a system instruction.",
      group: "Group A",
      participants: ["a@example.com", "b@example.com"],
    });
    expect(retry.idempotent).toBe(true);

    await expect(
      submitWorkspaceForm("user-1", item.id, {
        title: "Changed",
        course: "Research",
        due_date: "2026-09-01",
        word_target: 750,
        essay_prompt: "Write a response.",
        agent_instructions: "",
        group: "Group A",
        participants: ["a@example.com", "b@example.com"],
      })
    ).rejects.toBeInstanceOf(WorkspaceFormAlreadySubmittedError);
    const stored = await getWorkspaceItem("user-1", item.id);
    expect(stored?.kind).toBe("form_template");
    if (stored?.kind === "form_template") {
      expect(stored.submission?.status).toBe("submitted");
    }
  });

  it("does not partially write invalid form values or allow another owner", async () => {
    const item = await createWorkspaceItem(
      "user-1",
      "evaluchat-assignment-brief"
    );
    const writesBefore = harness.client.store.putItem.mock.calls.length;
    await expect(
      submitWorkspaceForm("user-1", item.id, {
        title: "",
        participants: "not-an-email",
      })
    ).rejects.toThrow("invalid");
    expect(harness.client.store.putItem.mock.calls.length).toBe(writesBefore);
    await expect(
      submitWorkspaceForm("user-2", item.id, {})
    ).rejects.toBeInstanceOf(WorkspaceItemNotFoundError);
  });

  it("attaches a thread to form items for the workspace chat", async () => {
    const item = await createWorkspaceItem(
      "user-1",
      "evaluchat-assignment-brief"
    );
    harness.state.threads.set("thread-1", {
      metadata: { user_id: "user-1", workspace_item_id: item.id },
    });
    const attached = await reconcileWorkspaceItemThread(
      "user-1",
      item.id,
      "thread-1"
    );
    expect(attached.kind).toBe("form_template");
    expect(attached.kind === "form_template" && attached.threadId).toBe(
      "thread-1"
    );
  });
});
