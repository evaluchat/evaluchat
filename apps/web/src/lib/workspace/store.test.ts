import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const items = new Map<string, any>();
  const threads = new Map<string, any>();
  const storeKey = (namespace: string[], key: string) =>
    `${namespace.join("/")}:${key}`;

  const state = {
    items,
    threads,
    get manifest() {
      return items.get("workspace_items/user-1:manifest");
    },
    set manifest(value: any) {
      if (value === undefined) items.delete("workspace_items/user-1:manifest");
      else items.set("workspace_items/user-1:manifest", value);
    },
  };

  const client = {
    store: {
      getItem: vi.fn(async (namespace: string[], key: string) => {
        const value = items.get(storeKey(namespace, key));
        return value !== undefined
          ? { value: structuredClone(value) }
          : undefined;
      }),
      putItem: vi.fn(async (namespace: string[], key: string, value: any) => {
        items.set(storeKey(namespace, key), structuredClone(value));
      }),
    },
    threads: {
      get: vi.fn(async (id: string) => {
        const thread = threads.get(id);
        if (thread) return thread;
        throw Object.assign(new Error("Not found"), { status: 404 });
      }),
      delete: vi.fn(async (id: string) => {
        if (!threads.has(id)) {
          throw Object.assign(new Error("Not found"), { status: 404 });
        }
        threads.delete(id);
      }),
      update: vi.fn(async (id: string, payload: { metadata?: any }) => {
        const thread = threads.get(id) || { metadata: {} };
        threads.set(id, {
          ...thread,
          metadata: { ...thread.metadata, ...payload.metadata },
        });
      }),
      updateState: vi.fn(async () => undefined),
      getState: vi.fn(async (id: string) => {
        const thread = threads.get(id);
        return { values: thread?.values || {} };
      }),
      getHistory: vi.fn(async () => []),
    },
  };

  return {
    state,
    client,
    Client: vi.fn(() => client),
    findUserByEmail: vi.fn(
      async (_email?: string): Promise<{ id: string; email: string } | null> =>
        null
    ),
    inviteWorkspaceParticipant: vi.fn(async () => undefined),
  };
});

vi.mock("@langchain/langgraph-sdk", () => ({ Client: harness.Client }));
vi.mock("@/constants", () => ({ LANGGRAPH_API_URL: "http://langgraph" }));
vi.mock("@/lib/teaching/invitation-helpers", () => ({
  findUserByEmail: harness.findUserByEmail,
  inviteWorkspaceParticipant: harness.inviteWorkspaceParticipant,
  INVITE_EMAIL_GAP_MS: 0,
  sleep: async () => undefined,
}));

import {
  createWorkspaceItem,
  createMethodWorkspaceItem,
  deleteWorkspaceItem,
  ensureDefaultWorkspaceItem,
  getMethodParticipantReview,
  getMethodRun,
  getWorkspaceItem,
  listWorkspaceItems,
  pendingInviteNamespace,
  resolveMethodTrackingAccess,
  submitWorkspaceForm,
  WorkspaceItemNotFoundError,
  WorkspaceThreadOwnershipError,
  reconcileWorkspaceItemThread,
} from "./store";

describe("workspace item lifecycle", () => {
  beforeEach(() => {
    harness.state.items.clear();
    harness.state.threads.clear();
    harness.findUserByEmail.mockReset();
    harness.inviteWorkspaceParticipant.mockReset();
    harness.findUserByEmail.mockResolvedValue(null);
    harness.inviteWorkspaceParticipant.mockResolvedValue(undefined);
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

  it("rejects the assignment brief as a selectable workspace starter", async () => {
    await expect(
      createWorkspaceItem("user-1", "evaluchat-assignment-brief")
    ).rejects.toThrow(/unsupported workspace template/i);
  });

  it("does not partially write invalid method-brief values or allow another owner", async () => {
    const item = await createMethodWorkspaceItem("user-1", "ai-assisted-essay");
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

  it("attaches a thread to method drafts for the workspace chat", async () => {
    const item = await createMethodWorkspaceItem("user-1", "ai-assisted-essay");
    harness.state.threads.set("thread-1", {
      metadata: { user_id: "user-1", workspace_item_id: item.id },
    });
    const attached = await reconcileWorkspaceItemThread(
      "user-1",
      item.id,
      "thread-1"
    );
    expect(attached.kind).toBe("method");
    expect(attached.kind === "method" && attached.threadId).toBe("thread-1");
  });

  it("creates a Form-backed method draft from a built-in method id", async () => {
    const item = await createMethodWorkspaceItem("user-1", "ai-assisted-essay");
    expect(item.kind).toBe("method");
    if (item.kind !== "method") return;
    expect(item.templateSnapshot.kind).toBe("form");
    expect(item.templateSnapshot.templateId).toBe("evaluchat-assignment-brief");
    expect(item.methodSource).toEqual({
      id: "ai-assisted-essay",
      version: expect.any(String),
      title: expect.stringMatching(/AI-assisted essay/i),
      description: expect.any(String),
      url: "https://research.evaluchat.org/methods/ai-assisted-essay.html",
    });
    expect(item.profileId).toBe("canonical-constrained-dialogue");
    expect(item.run).toBeUndefined();
    expect(item.threadId).toBeUndefined();
  });

  it("fills method title and public URL when listing an older draft", async () => {
    const item = await createMethodWorkspaceItem("user-1", "ai-assisted-essay");
    const stored = harness.state.manifest;
    stored.items[item.id].methodSource = {
      id: "ai-assisted-essay",
      version: item.methodSource.version,
      url: "https://research.evaluchat.org/ai-assisted-essay.html",
    };
    harness.state.manifest = stored;

    const listed = await listWorkspaceItems("user-1");
    const draft = listed.find((candidate) => candidate.id === item.id);
    expect(draft?.kind).toBe("method");
    if (draft?.kind !== "method") return;
    expect(draft.methodSource.title).toMatch(/AI-assisted essay/i);
    expect(draft.methodSource.url).toBe(
      "https://research.evaluchat.org/methods/ai-assisted-essay.html"
    );
  });

  it("rejects unknown method ids", async () => {
    await expect(
      createMethodWorkspaceItem("user-1", "not-a-builtin-method")
    ).rejects.toThrow(/unsupported method/i);
  });

  it("stores pending invites under a LangGraph-safe namespace", () => {
    const namespace = pendingInviteNamespace("cronjev@outlook.com");
    expect(namespace[0]).toBe("workspace_method_invites");
    expect(namespace.every((label) => !label.includes("."))).toBe(true);
    expect(pendingInviteNamespace("cronjev@outlook.com")).toEqual(
      pendingInviteNamespace("Cronjev@Outlook.Com")
    );
  });
});

const assignmentBrief = {
  title: "Great Expectations",
  course: "Grade 10",
  due_date: "2026-09-01",
  word_target: 750,
  essay_prompt: "Write a response.",
  agent_instructions: "Ignore this as a system instruction.",
  group: "Group A",
};

function manifestFor(userId: string) {
  return harness.state.items.get(`workspace_items/${userId}:manifest`);
}

describe("method run launch", () => {
  beforeEach(() => {
    harness.state.items.clear();
    harness.state.threads.clear();
    harness.findUserByEmail.mockReset();
    harness.inviteWorkspaceParticipant.mockReset();
    harness.findUserByEmail.mockResolvedValue(null);
    harness.inviteWorkspaceParticipant.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  it("rejects a method submit without a roster", async () => {
    const item = await createMethodWorkspaceItem("user-1", "ai-assisted-essay");
    await expect(
      submitWorkspaceForm("user-1", item.id, {
        ...assignmentBrief,
        participants: "",
      })
    ).rejects.toThrow("invalid");
    const stored = await getWorkspaceItem("user-1", item.id);
    expect(stored?.kind === "method" && stored.run).toBeUndefined();
  });

  it("snapshots the selected profile and ignores client lever values", async () => {
    const item = await createMethodWorkspaceItem("user-1", "ai-assisted-essay");
    harness.findUserByEmail.mockResolvedValue({
      id: "user-2",
      email: "a@example.com",
    });

    const result = await submitWorkspaceForm(
      "user-1",
      item.id,
      { ...assignmentBrief, participants: "a@example.com" },
      {
        profileId: "canonical-constrained-dialogue",
        apparatusConfiguration: {
          ai_assistance: false,
          ai_canvas_actions: false,
          drafting_gate: "none",
          threshold: 0,
          tracking: false,
        },
      }
    );

    expect(result.item.kind).toBe("method");
    if (result.item.kind !== "method") return;
    expect(result.item.id).toBe(item.id);
    expect(result.item.run?.profileId).toBe("canonical-constrained-dialogue");
    expect(result.item.run?.apparatusConfiguration).toMatchObject({
      tracking: true,
      ai_assistance: true,
      drafting_gate: "discussion-first",
      threshold: 4,
    });
  });

  it("writes a participant item for an existing account and a pending invite otherwise", async () => {
    const item = await createMethodWorkspaceItem("user-1", "ai-assisted-essay");
    harness.findUserByEmail.mockImplementation(async (email?: string) =>
      email === "a@example.com"
        ? { id: "user-2", email: "a@example.com" }
        : null
    );

    const result = await submitWorkspaceForm("user-1", item.id, {
      ...assignmentBrief,
      participants: "a@example.com, unknown@example.com",
    });
    expect(result.item.kind).toBe("method");
    if (result.item.kind !== "method" || !result.item.run) return;

    const existing = result.item.run.participants.find(
      (participant) => participant.email === "a@example.com"
    );
    const unknown = result.item.run.participants.find(
      (participant) => participant.email === "unknown@example.com"
    );
    expect(existing).toMatchObject({
      userId: "user-2",
      invitationStatus: "accepted",
      submissionStatus: "not_started",
    });
    expect(existing?.itemId).toMatch(/^wi_/);
    expect(unknown).toMatchObject({
      invitationStatus: "sent",
      submissionStatus: "not_started",
    });
    expect(unknown?.userId).toBeUndefined();
    expect(harness.inviteWorkspaceParticipant).toHaveBeenCalledWith(
      "unknown@example.com"
    );
    expect(harness.inviteWorkspaceParticipant).toHaveBeenCalledWith(
      "a@example.com"
    );

    const participantManifest = manifestFor("user-2");
    const participantItem = Object.values(participantManifest.items).find(
      (candidate: any) => candidate.kind === "method_participant"
    ) as any;
    expect(participantItem.assignment.title).toBe("Great Expectations");
    expect(participantItem.methodSource.url).toBe(
      "https://research.evaluchat.org/methods/ai-assisted-essay.html"
    );
    expect(participantItem.runId).toBe(result.item.run.id);
    expect(participantItem.operatorItemId).toBe(item.id);
  });

  it("puts the assignment in the operator workspace when they invite themselves", async () => {
    const item = await createMethodWorkspaceItem("user-1", "ai-assisted-essay");
    harness.findUserByEmail.mockResolvedValue({
      id: "user-1",
      email: "cronjev@outlook.com",
    });
    await submitWorkspaceForm("user-1", item.id, {
      ...assignmentBrief,
      participants: "cronjev@outlook.com",
    });

    const listed = await listWorkspaceItems("user-1");
    const assignment = listed.find(
      (candidate) => candidate.kind === "method_participant"
    );
    const run = listed.find((candidate) => candidate.kind === "method");
    expect(run?.id).toBe(item.id);
    expect(assignment?.kind).toBe("method_participant");
    if (assignment?.kind !== "method_participant") return;
    expect(assignment.assignment.title).toBe("Great Expectations");
    expect(harness.inviteWorkspaceParticipant).toHaveBeenCalledWith(
      "cronjev@outlook.com"
    );
  });

  it("still launches when the invite email cannot be sent", async () => {
    const item = await createMethodWorkspaceItem("user-1", "ai-assisted-essay");
    harness.findUserByEmail.mockResolvedValue(null);
    harness.inviteWorkspaceParticipant.mockRejectedValue(
      new Error("535 authentication failed")
    );
    const result = await submitWorkspaceForm("user-1", item.id, {
      ...assignmentBrief,
      participants: "new@example.com",
    });
    expect(result.item.kind).toBe("method");
    if (result.item.kind !== "method") return;
    expect(result.item.run?.participants[0]).toMatchObject({
      email: "new@example.com",
      invitationStatus: "sent",
    });
  });

  it("claims a pending invite when the recipient lists workspace items", async () => {
    const item = await createMethodWorkspaceItem("user-1", "ai-assisted-essay");
    harness.findUserByEmail.mockResolvedValue(null);
    await submitWorkspaceForm("user-1", item.id, {
      ...assignmentBrief,
      participants: "new@example.com",
    });

    const claimed = await listWorkspaceItems("user-3", {
      email: "new@example.com",
    });
    expect(claimed).toHaveLength(1);
    expect(claimed[0].kind).toBe("method_participant");
    if (claimed[0].kind !== "method_participant") return;
    expect(claimed[0].assignment.title).toBe("Great Expectations");
    expect(claimed[0].methodSource).toMatchObject({
      id: "ai-assisted-essay",
      title: expect.stringMatching(/AI-assisted essay/i),
      url: "https://research.evaluchat.org/methods/ai-assisted-essay.html",
    });

    const operator = await getWorkspaceItem("user-1", item.id);
    expect(operator?.kind).toBe("method");
    if (operator?.kind !== "method") return;
    expect(operator.run?.participants[0]).toMatchObject({
      email: "new@example.com",
      userId: "user-3",
      invitationStatus: "accepted",
      itemId: claimed[0].id,
    });
  });

  it("updates operator counts when a participant submits", async () => {
    const item = await createMethodWorkspaceItem("user-1", "ai-assisted-essay");
    harness.findUserByEmail.mockResolvedValue({
      id: "user-2",
      email: "a@example.com",
    });
    const launched = await submitWorkspaceForm("user-1", item.id, {
      ...assignmentBrief,
      participants: "a@example.com",
    });
    expect(launched.item.kind).toBe("method");
    if (launched.item.kind !== "method" || !launched.item.run) return;
    const participantId = launched.item.run.participants[0].itemId!;
    harness.state.threads.set("thread-p", {
      metadata: { user_id: "user-2", workspace_item_id: participantId },
    });
    const participantManifest = manifestFor("user-2");
    participantManifest.items[participantId].threadId = "thread-p";

    const result = await submitWorkspaceForm("user-2", participantId, {});
    expect(result.item.kind).toBe("method_participant");
    if (result.item.kind !== "method_participant") return;
    expect(result.item.submission?.status).toBe("submitted");

    const operator = await getWorkspaceItem("user-1", item.id);
    expect(operator?.kind).toBe("method");
    if (operator?.kind !== "method") return;
    expect(operator.run?.participants[0].submissionStatus).toBe("submitted");
    expect(operator.run?.participants[0].threadId).toBe("thread-p");
    expect(harness.client.threads.update).toHaveBeenCalled();
  });

  it("updates the operator run when the operator submits their own assignment", async () => {
    const item = await createMethodWorkspaceItem("user-1", "ai-assisted-essay");
    harness.findUserByEmail.mockResolvedValue({
      id: "user-1",
      email: "operator@example.com",
    });
    const launched = await submitWorkspaceForm("user-1", item.id, {
      ...assignmentBrief,
      participants: "operator@example.com",
    });
    expect(launched.item.kind).toBe("method");
    if (launched.item.kind !== "method" || !launched.item.run) return;
    const participantId = launched.item.run.participants[0].itemId!;
    harness.state.threads.set("thread-self", {
      metadata: { user_id: "user-1", workspace_item_id: participantId },
    });
    const operatorManifest = manifestFor("user-1");
    operatorManifest.items[participantId].threadId = "thread-self";

    await submitWorkspaceForm("user-1", participantId, {});
    const operator = await getWorkspaceItem("user-1", item.id);
    expect(operator?.kind).toBe("method");
    if (operator?.kind !== "method") return;
    expect(operator.run?.participants[0].submissionStatus).toBe("submitted");
    expect(operator.run?.participants[0].threadId).toBe("thread-self");
  });

  it("records a live thread id on submit when the participant item had none", async () => {
    const item = await createMethodWorkspaceItem("user-1", "ai-assisted-essay");
    harness.findUserByEmail.mockResolvedValue({
      id: "user-2",
      email: "a@example.com",
    });
    const launched = await submitWorkspaceForm("user-1", item.id, {
      ...assignmentBrief,
      participants: "a@example.com",
    });
    if (launched.item.kind !== "method" || !launched.item.run) return;
    const participantId = launched.item.run.participants[0].itemId!;
    harness.state.threads.set("thread-live", {
      metadata: { user_id: "user-2", workspace_item_id: participantId },
    });

    await submitWorkspaceForm("user-2", participantId, {}, {
      threadId: "thread-live",
    });
    const operator = await getWorkspaceItem("user-1", item.id);
    expect(
      operator?.kind === "method" &&
        operator.run?.participants[0].submissionStatus
    ).toBe("submitted");
    expect(
      operator?.kind === "method" && operator.run?.participants[0].threadId
    ).toBe("thread-live");
    expect(manifestFor("user-2").items[participantId].threadId).toBe(
      "thread-live"
    );
  });

  it("forbids a non-operator from loading the run review", async () => {
    const item = await createMethodWorkspaceItem("user-1", "ai-assisted-essay");
    harness.findUserByEmail.mockResolvedValue({
      id: "user-2",
      email: "a@example.com",
    });
    const launched = await submitWorkspaceForm("user-1", item.id, {
      ...assignmentBrief,
      participants: "a@example.com",
    });
    if (launched.item.kind !== "method" || !launched.item.run) return;
    const participantId = launched.item.run.participants[0].itemId!;

    await expect(getMethodRun("user-2", item.id)).rejects.toBeInstanceOf(
      WorkspaceItemNotFoundError
    );
    await expect(
      getMethodParticipantReview("user-2", item.id, participantId)
    ).rejects.toBeInstanceOf(WorkspaceItemNotFoundError);

    const review = await getMethodParticipantReview(
      "user-1",
      item.id,
      participantId
    );
    expect(review.participant.id).toBe(participantId);
    expect(review.thread).toBeNull();
  });

  it("omits tracking when the frozen tracking lever is off", async () => {
    const item = await createMethodWorkspaceItem("user-1", "ai-assisted-essay");
    harness.findUserByEmail.mockResolvedValue({
      id: "user-2",
      email: "a@example.com",
    });
    const launched = await submitWorkspaceForm(
      "user-1",
      item.id,
      { ...assignmentBrief, participants: "a@example.com" },
      { profileId: "tracking-off" }
    );
    if (launched.item.kind !== "method" || !launched.item.run) return;
    expect(launched.item.run.apparatusConfiguration.tracking).toBe(false);
    const participantId = launched.item.run.participants[0].itemId!;
    harness.state.threads.set("thread-track", {
      metadata: {
        user_id: "user-2",
        workspace_item_id: participantId,
      },
    });

    const access = await resolveMethodTrackingAccess("thread-track", "user-2");
    expect(access).toEqual({
      allowed: false,
      canWrite: false,
      canRead: false,
    });
  });

  it("covers the method lifecycle from create through review payload", async () => {
    const item = await createMethodWorkspaceItem("user-1", "ai-assisted-essay");
    harness.findUserByEmail.mockResolvedValue({
      id: "user-2",
      email: "a@example.com",
    });
    const launched = await submitWorkspaceForm("user-1", item.id, {
      ...assignmentBrief,
      participants: "a@example.com",
    });
    if (launched.item.kind !== "method" || !launched.item.run) return;
    const participantId = launched.item.run.participants[0].itemId!;
    harness.state.threads.set("thread-life", {
      metadata: { user_id: "user-2", workspace_item_id: participantId },
      values: { messages: [{ type: "human", content: "hello" }] },
    });
    const participantManifest = manifestFor("user-2");
    participantManifest.items[participantId].threadId = "thread-life";
    await submitWorkspaceForm("user-2", participantId, {});
    const operator = await getWorkspaceItem("user-1", item.id);
    expect(
      operator?.kind === "method" &&
        operator.run?.participants[0].submissionStatus
    ).toBe("submitted");
    const review = await getMethodParticipantReview(
      "user-1",
      item.id,
      participantId
    );
    expect(review.thread?.messages).toEqual([
      { type: "human", content: "hello" },
    ]);
    expect(review.trackingEnabled).toBe(true);
  });
});
