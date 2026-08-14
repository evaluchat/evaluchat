import { Client } from "@langchain/langgraph-sdk";
import { randomUUID } from "node:crypto";
import { LANGGRAPH_API_URL } from "@/constants";
import {
  FormValidationError,
  resolveFormMarkdown,
  submissionEquals,
  validateFormValues,
} from "./form-validation";
import type { FormValue, MethodRunParticipant } from "./types";
import {
  DEFAULT_METHOD_PROFILE_ID,
  DEFAULT_WORKSPACE_TEMPLATE_ID,
  MarkdownTemplateSnapshot,
  MarkdownWorkspaceItem,
  MethodParticipantWorkspaceItem,
  MethodRun,
  MethodRunAssignment,
  MethodSource,
  MethodWorkspaceItem,
  PendingMethodInvite,
  WorkspaceItem,
  WorkspaceManifest,
} from "./types";
import {
  catalogForTemplateId,
  getTemplateById,
  isSelectableTemplate,
} from "./template-catalog";
import { publicMethodPageUrl } from "./method-links";
import {
  BUILTIN_APPARATUS_IDS,
  getApparatusSpecification,
  getDefaultApparatusProfile,
  resolveApparatusConfiguration,
} from "@/lib/apparatuses/runtime";
import {
  INVITE_EMAIL_GAP_MS,
  findUserByEmail,
  inviteWorkspaceParticipant,
  sleep,
} from "@/lib/teaching/invitation-helpers";

const MANIFEST_KEY = "manifest";
const LOCK_KEY = "lock";
/** Store SDK TTL is in minutes (see @langchain/langgraph-sdk StoreClient.putItem). */
const WORKSPACE_LOCK_TTL_MINUTES = 1;

/** Test seam: mutate `.value` for lease TTL / renewal-interval math. */
export const workspaceLockTtlMs = { value: 60_000 };
/** Test seam: mutate `.value` to keep lock-timeout tests fast. */
export const workspaceLockRetryDelayMs = { value: 100 };
/** Test seam: mutate `.value` to bound acquisition wait; default ~10s. */
export const workspaceLockAcquireTimeoutMs = { value: 10_000 };

type WorkspaceLockValue = {
  token: string;
  expiresAt: number;
};

export class WorkspaceItemNotFoundError extends Error {
  constructor() {
    super("Workspace item not found");
    this.name = "WorkspaceItemNotFoundError";
  }
}

export class WorkspaceLockTimeoutError extends Error {
  constructor(userId: string) {
    super(`Timed out acquiring workspace lock for user ${userId}`);
    this.name = "WorkspaceLockTimeoutError";
  }
}

export class WorkspaceThreadOwnershipError extends Error {
  constructor() {
    super("Workspace thread does not belong to the workspace item");
    this.name = "WorkspaceThreadOwnershipError";
  }
}

export class WorkspaceItemThreadNotAllowedError extends Error {
  constructor() {
    super("This workspace item does not support an assistant thread");
    this.name = "WorkspaceItemThreadNotAllowedError";
  }
}

export class WorkspaceFormAlreadySubmittedError extends Error {
  constructor() {
    super("Form has already been submitted");
    this.name = "WorkspaceFormAlreadySubmittedError";
  }
}

export class UnsupportedMethodError extends Error {
  constructor() {
    super("Unsupported method");
    this.name = "UnsupportedMethodError";
  }
}

export function parseCatalogTemplateRef(ref: string): {
  id: string;
  version?: string;
} {
  const at = ref.lastIndexOf("@");
  if (at <= 0) return { id: ref };
  return { id: ref.slice(0, at), version: ref.slice(at + 1) };
}

function client(): Client {
  return new Client({
    apiUrl: LANGGRAPH_API_URL,
    apiKey: process.env.LANGCHAIN_API_KEY,
  });
}

function namespace(userId: string): string[] {
  return ["workspace_items", userId];
}

function normaliseWorkspaceItem(value: unknown): WorkspaceItem | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as WorkspaceItem & {
    templateSnapshot?: Record<string, unknown>;
  };
  if (
    item.kind === "markdown_template" &&
    item.templateSnapshot &&
    !item.templateSnapshot.kind
  ) {
    return {
      ...item,
      templateSnapshot: {
        ...item.templateSnapshot,
        kind: "markdown",
      } as MarkdownTemplateSnapshot,
    } as MarkdownWorkspaceItem;
  }
  return item;
}

async function readManifest(userId: string): Promise<WorkspaceManifest> {
  const item = await client().store.getItem(namespace(userId), MANIFEST_KEY);
  const value = item?.value as Partial<WorkspaceManifest> | undefined;
  if (!value || typeof value !== "object" || !value.items) {
    return { initialized: false, items: {} };
  }
  const items = Object.fromEntries(
    Object.entries(value.items as Record<string, unknown>)
      .map(([id, item]) => [id, normaliseWorkspaceItem(item)] as const)
      .filter((entry): entry is [string, WorkspaceItem] => Boolean(entry[1]))
  );
  return {
    initialized: value.initialized === true,
    defaultItemId:
      typeof value.defaultItemId === "string" ? value.defaultItemId : undefined,
    items,
  };
}

async function writeManifest(
  userId: string,
  manifest: WorkspaceManifest
): Promise<void> {
  await client().store.putItem(namespace(userId), MANIFEST_KEY, manifest);
}

function lockValue(value: unknown): WorkspaceLockValue | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<WorkspaceLockValue>;
  if (
    typeof candidate.token !== "string" ||
    typeof candidate.expiresAt !== "number"
  ) {
    return undefined;
  }
  return { token: candidate.token, expiresAt: candidate.expiresAt };
}

async function acquireUserLock(userId: string): Promise<string> {
  const ns = namespace(userId);
  const token = randomUUID();
  const deadline = Date.now() + workspaceLockAcquireTimeoutMs.value;

  while (Date.now() < deadline) {
    const existing = lockValue(
      (await client().store.getItem(ns, LOCK_KEY))?.value
    );
    const heldByOther =
      existing && existing.token !== token && existing.expiresAt > Date.now();

    if (heldByOther) {
      await sleep(workspaceLockRetryDelayMs.value);
      continue;
    }

    // Free, missing, or expired: claim (last-writer-wins among contenders).
    const expiresAt = Date.now() + workspaceLockTtlMs.value;
    await client().store.putItem(
      ns,
      LOCK_KEY,
      { token, expiresAt },
      { ttl: WORKSPACE_LOCK_TTL_MINUTES }
    );
    const stored = lockValue(
      (await client().store.getItem(ns, LOCK_KEY))?.value
    );
    if (stored?.token === token) {
      // Settle-verify: catch a late contender putItem that landed after read-back.
      await sleep(workspaceLockRetryDelayMs.value);
      const settled = lockValue(
        (await client().store.getItem(ns, LOCK_KEY))?.value
      );
      if (settled?.token === token) {
        return token;
      }
    }
    await sleep(workspaceLockRetryDelayMs.value);
  }

  throw new WorkspaceLockTimeoutError(userId);
}

async function releaseUserLock(userId: string, token: string): Promise<void> {
  const ns = namespace(userId);
  const stored = lockValue((await client().store.getItem(ns, LOCK_KEY))?.value);
  if (stored?.token !== token) return;
  await client().store.deleteItem(ns, LOCK_KEY);
  // An in-flight heartbeat renewal may have re-created our lock after the
  // delete; at most one can be in flight (interval cleared before release).
  const after = lockValue((await client().store.getItem(ns, LOCK_KEY))?.value);
  if (after?.token === token) {
    await client().store.deleteItem(ns, LOCK_KEY);
  }
}

async function renewUserLock(userId: string, token: string): Promise<void> {
  const ns = namespace(userId);
  await client().store.putItem(
    ns,
    LOCK_KEY,
    { token, expiresAt: Date.now() + workspaceLockTtlMs.value },
    { ttl: WORKSPACE_LOCK_TTL_MINUTES }
  );
}

async function withUserLock<T>(
  userId: string,
  operation: () => Promise<T>
): Promise<T> {
  const token = await acquireUserLock(userId);
  let released = false;
  const renewalMs = Math.max(1, Math.floor(workspaceLockTtlMs.value / 3));
  const heartbeat = setInterval(() => {
    if (released) return;
    void renewUserLock(userId, token);
  }, renewalMs);
  try {
    return await operation();
  } finally {
    released = true;
    clearInterval(heartbeat);
    await releaseUserLock(userId, token);
  }
}

function snapshotFromTemplate(templateId: string) {
  const template = getTemplateById(templateId);
  if (!template) throw new Error("Unsupported workspace template");
  const catalog = catalogForTemplateId(templateId);

  if (template.templateKind === "form") {
    return {
      kind: "form" as const,
      catalogRevision: catalog.catalogRevision,
      templateVersion: template.version,
      sourcePath: template.sourcePath,
      templateSnapshot: {
        kind: "form" as const,
        templateId: template.id,
        templateVersion: template.version,
        catalogRevision: catalog.catalogRevision,
        contentHash: template.contentHash,
        title: template.title,
        description: template.description,
        assistantGuidance: template.assistantGuidance,
        layoutMarkdown: template.layoutMarkdown,
        fields: structuredClone(template.fields),
      },
    };
  }

  return {
    kind: "markdown" as const,
    catalogRevision: catalog.catalogRevision,
    templateVersion: template.version,
    sourcePath: template.sourcePath,
    templateSnapshot: {
      kind: "markdown" as const,
      title: template.title,
      description: template.description,
      initialMarkdown: template.initialMarkdown,
      assistantGuidance: template.assistantGuidance,
      contentHash: template.contentHash,
    },
  };
}

function createItem(userId: string, templateId: string): WorkspaceItem {
  const now = new Date().toISOString();
  const snapshot = snapshotFromTemplate(templateId);
  const base = {
    id: `wi_${randomUUID()}`,
    ownerId: userId,
    status: "active" as const,
    createdAt: now,
    updatedAt: now,
    source: {
      catalogRevision: snapshot.catalogRevision,
      templateId,
      templateVersion: snapshot.templateVersion,
      sourcePath: snapshot.sourcePath,
    },
  };

  if (snapshot.kind === "form") {
    return {
      ...base,
      kind: "form_template",
      templateSnapshot: snapshot.templateSnapshot,
    };
  }
  return {
    ...base,
    kind: "markdown_template",
    templateSnapshot: snapshot.templateSnapshot,
  };
}

export async function ensureDefaultWorkspaceItem(
  userId: string
): Promise<WorkspaceItem | undefined> {
  return withUserLock(userId, async () => {
    const manifest = await readManifest(userId);
    const existing = manifest.defaultItemId
      ? manifest.items[manifest.defaultItemId]
      : Object.values(manifest.items).sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt)
        )[0];
    if (existing) {
      if (!manifest.defaultItemId || !manifest.initialized) {
        manifest.defaultItemId = existing.id;
        manifest.initialized = true;
        await writeManifest(userId, manifest);
      }
      return existing;
    }

    if (manifest.initialized) return undefined;

    const item = createItem(userId, DEFAULT_WORKSPACE_TEMPLATE_ID);
    manifest.initialized = true;
    manifest.defaultItemId = item.id;
    manifest.items[item.id] = item;
    await writeManifest(userId, manifest);
    return item;
  });
}

function enrichMethodSource(source: MethodSource): MethodSource {
  const url = publicMethodPageUrl(source.id);
  if (source.title && source.description && source.url === url) return source;
  const spec = getApparatusSpecification(source.id);
  return {
    ...source,
    title: source.title || spec?.name,
    description: source.description || spec?.description,
    url,
  };
}

function enrichWorkspaceItem<T extends WorkspaceItem>(item: T): T {
  if (item.kind !== "method" && item.kind !== "method_participant") {
    return item;
  }
  return { ...item, methodSource: enrichMethodSource(item.methodSource) };
}

export async function listWorkspaceItems(
  userId: string,
  options?: { email?: string }
): Promise<WorkspaceItem[]> {
  if (options?.email) {
    try {
      await claimPendingMethodInvites(userId, options.email);
    } catch (error) {
      console.error("[workspace] failed to claim pending invites", error);
    }
  }
  const manifest = await readManifest(userId);
  const items = await Promise.all(
    Object.values(manifest.items)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(async (item) => {
        if (item.kind === "method" && item.run) {
          return reconcileMethodRunSubmissions(userId, item);
        }
        return item;
      })
  );
  return items.map(enrichWorkspaceItem);
}

export async function createWorkspaceItem(
  userId: string,
  templateId: string
): Promise<WorkspaceItem> {
  return withUserLock(userId, async () => {
    if (!isSelectableTemplate(templateId)) {
      throw new Error("Unsupported workspace template");
    }
    const manifest = await readManifest(userId);
    const item = createItem(userId, templateId);
    manifest.initialized = true;
    manifest.items[item.id] = item;
    await writeManifest(userId, manifest);
    return item;
  });
}

export async function createMethodWorkspaceItem(
  userId: string,
  methodId: string
): Promise<MethodWorkspaceItem> {
  return withUserLock(userId, async () => {
    const spec = getApparatusSpecification(methodId);
    if (!spec || !BUILTIN_APPARATUS_IDS.has(methodId)) {
      throw new UnsupportedMethodError();
    }
    const brief = spec.run_brief_template;
    if (!brief) throw new UnsupportedMethodError();
    const { id: templateId, version } = parseCatalogTemplateRef(brief);
    const snapshot = snapshotFromTemplate(templateId);
    if (snapshot.kind !== "form") throw new UnsupportedMethodError();
    if (version && snapshot.templateVersion !== version) {
      throw new UnsupportedMethodError();
    }

    const profile = getDefaultApparatusProfile(methodId) ?? spec.profiles[0];
    const now = new Date().toISOString();
    const item: MethodWorkspaceItem = {
      id: `wi_${randomUUID()}`,
      ownerId: userId,
      status: "active",
      createdAt: now,
      updatedAt: now,
      source: {
        catalogRevision: snapshot.catalogRevision,
        templateId,
        templateVersion: snapshot.templateVersion,
        sourcePath: snapshot.sourcePath,
      },
      kind: "method",
      templateSnapshot: snapshot.templateSnapshot,
      methodSource: {
        id: spec.id,
        version: spec.version,
        title: spec.name,
        description: spec.description,
        url: publicMethodPageUrl(spec.id),
      },
      profileId: profile?.id ?? DEFAULT_METHOD_PROFILE_ID,
      profiles: spec.profiles.map((option) => ({
        id: option.id,
        label: option.label,
      })),
    };

    const manifest = await readManifest(userId);
    manifest.initialized = true;
    manifest.items[item.id] = item;
    await writeManifest(userId, manifest);
    return item;
  });
}

export async function submitWorkspaceForm(
  userId: string,
  itemId: string,
  rawValues: unknown,
  options?: {
    profileId?: string;
    threadId?: string;
  }
): Promise<{ item: WorkspaceItem; idempotent: boolean }> {
  const result = await withUserLock(userId, async () => {
    const manifest = await readManifest(userId);
    const item = manifest.items[itemId];
    if (!item || item.ownerId !== userId || item.status !== "active") {
      throw new WorkspaceItemNotFoundError();
    }
    if (
      item.kind !== "form_template" &&
      item.kind !== "method" &&
      item.kind !== "method_participant"
    ) {
      throw new WorkspaceItemNotFoundError();
    }

    if (item.kind === "method_participant") {
      return submitMethodParticipant(userId, manifest, item, options?.threadId);
    }

    let values: Record<string, FormValue>;
    try {
      values = validateFormValues(item.templateSnapshot.fields, rawValues);
    } catch (error) {
      if (error instanceof FormValidationError) throw error;
      throw error;
    }
    const resolvedMarkdown = resolveFormMarkdown(
      item.templateSnapshot.layoutMarkdown,
      item.templateSnapshot.fields,
      values
    );

    if (item.kind === "form_template") {
      if (item.submission) {
        if (submissionEquals(item.submission, values, resolvedMarkdown)) {
          return { item, idempotent: true, deferred: [] };
        }
        throw new WorkspaceFormAlreadySubmittedError();
      }

      item.submission = {
        status: "submitted",
        values,
        resolvedMarkdown,
        submittedAt: new Date().toISOString(),
      };
      item.updatedAt = item.submission.submittedAt;
      manifest.items[item.id] = item;
      await writeManifest(userId, manifest);
      return { item, idempotent: false, deferred: [] };
    }

    if (item.run) {
      if (
        item.submission &&
        submissionEquals(item.submission, values, resolvedMarkdown)
      ) {
        return { item, idempotent: true, deferred: [] };
      }
      throw new WorkspaceFormAlreadySubmittedError();
    }

    const launched = await launchMethodRun(userId, manifest, item, values, {
      profileId: options?.profileId,
      resolvedMarkdown,
    });
    return {
      item: launched.item,
      idempotent: false,
      deferred: launched.deferred,
    };
  });
  await Promise.all(result.deferred.map((job) => job()));
  return { item: result.item, idempotent: result.idempotent };
}

async function attachOwnedThread(
  userId: string,
  itemId: string,
  threadId: string
): Promise<string> {
  const thread = await client().threads.get(threadId);
  const metadata = (thread?.metadata || {}) as Record<string, unknown>;
  if (metadata.user_id !== userId || metadata.workspace_item_id !== itemId) {
    throw new WorkspaceThreadOwnershipError();
  }
  return threadId;
}

function markOperatorParticipantSubmitted(
  manifest: WorkspaceManifest,
  operatorItemId: string,
  userId: string,
  participantItemId: string,
  submittedAt: string,
  threadId?: string
): boolean {
  const operatorItem = manifest.items[operatorItemId];
  if (operatorItem?.kind !== "method" || !operatorItem.run) return false;
  const row = operatorItem.run.participants.find(
    (participant) =>
      participant.itemId === participantItemId || participant.userId === userId
  );
  if (!row) return false;
  row.submissionStatus = "submitted";
  row.submittedAt = submittedAt;
  row.threadId = threadId ?? row.threadId;
  row.invitationStatus = "accepted";
  operatorItem.updatedAt = submittedAt;
  manifest.items[operatorItem.id] = operatorItem;
  return true;
}

async function syncOperatorParticipantSubmission(
  item: MethodParticipantWorkspaceItem,
  submittedAt: string,
  threadId?: string
): Promise<void> {
  await withUserLock(item.operatorId, async () => {
    const manifest = await readManifest(item.operatorId);
    if (
      markOperatorParticipantSubmitted(
        manifest,
        item.operatorItemId,
        item.ownerId,
        item.id,
        submittedAt,
        threadId
      )
    ) {
      await writeManifest(item.operatorId, manifest);
    }
  });
}

async function reconcileMethodRunSubmissions(
  operatorId: string,
  item: MethodWorkspaceItem
): Promise<MethodWorkspaceItem> {
  if (!item.run) return item;
  let changed = false;
  const submittedAtFallback = new Date().toISOString();

  for (const row of item.run.participants) {
    if (!row.userId || !row.itemId) continue;
    if (row.submissionStatus === "submitted") continue;
    try {
      const participantManifest = await readManifest(row.userId);
      const participant = participantManifest.items[row.itemId];
      if (
        participant?.kind !== "method_participant" ||
        participant.operatorId !== operatorId ||
        participant.operatorItemId !== item.id ||
        participant.submission?.status !== "submitted"
      ) {
        continue;
      }
      row.submissionStatus = "submitted";
      row.submittedAt =
        participant.submission.submittedAt ?? submittedAtFallback;
      row.threadId = participant.threadId ?? row.threadId;
      row.invitationStatus = "accepted";
      changed = true;
    } catch (error) {
      console.error(
        "[workspace] failed to reconcile participant submission",
        row.itemId,
        error
      );
    }
  }

  if (!changed) return item;

  await withUserLock(operatorId, async () => {
    const manifest = await readManifest(operatorId);
    const stored = manifest.items[item.id];
    if (stored?.kind !== "method" || !stored.run) return;
    for (const row of item.run!.participants) {
      const storedRow = stored.run.participants.find(
        (candidate) =>
          candidate.itemId === row.itemId ||
          (row.userId && candidate.userId === row.userId) ||
          candidate.email === row.email
      );
      if (!storedRow || storedRow.submissionStatus === "submitted") continue;
      if (row.submissionStatus === "submitted") {
        storedRow.submissionStatus = "submitted";
        storedRow.submittedAt = row.submittedAt;
        storedRow.threadId = row.threadId;
        storedRow.invitationStatus = "accepted";
      }
    }
    stored.updatedAt = new Date().toISOString();
    manifest.items[item.id] = stored;
    await writeManifest(operatorId, manifest);
  });

  return item;
}

async function submitMethodParticipant(
  userId: string,
  manifest: WorkspaceManifest,
  item: MethodParticipantWorkspaceItem,
  liveThreadId?: string
): Promise<{
  item: WorkspaceItem;
  idempotent: boolean;
  deferred: Array<() => Promise<void>>;
}> {
  const deferred: Array<() => Promise<void>> = [];
  let threadId = item.threadId;
  if (liveThreadId && liveThreadId !== threadId) {
    threadId = await attachOwnedThread(userId, item.id, liveThreadId);
    item.threadId = threadId;
  }

  if (item.submission?.status === "submitted") {
    if (item.operatorId === userId) {
      if (
        markOperatorParticipantSubmitted(
          manifest,
          item.operatorItemId,
          userId,
          item.id,
          item.submission.submittedAt,
          threadId
        )
      ) {
        await writeManifest(userId, manifest);
      }
    } else {
      deferred.push(() =>
        syncOperatorParticipantSubmission(
          item,
          item.submission!.submittedAt,
          threadId
        )
      );
    }
    return { item, idempotent: true, deferred };
  }

  const submittedAt = new Date().toISOString();
  item.submission = { status: "submitted", submittedAt };
  item.updatedAt = submittedAt;
  manifest.items[item.id] = item;
  await writeManifest(userId, manifest);

  if (threadId) {
    try {
      const thread = await client().threads.get(threadId);
      const metadata = (thread?.metadata || {}) as Record<string, unknown>;
      await client().threads.update(threadId, {
        metadata: {
          ...metadata,
          completionPercent: 100,
          phase_state: "submitted",
          phaseState: "submitted",
          submittedAt,
        },
      });
      const updater = (
        client().threads as Client["threads"] & {
          updateState?: (
            id: string,
            payload: { values: Record<string, unknown> }
          ) => Promise<unknown>;
        }
      ).updateState;
      if (updater) {
        await updater(threadId, {
          values: { phase_state: "submitted" },
        });
      }
    } catch (error) {
      if (!isMissingThreadError(error)) {
        console.error("[workspace] failed to mark thread submitted", error);
      }
    }
  }

  if (item.operatorId === userId) {
    markOperatorParticipantSubmitted(
      manifest,
      item.operatorItemId,
      userId,
      item.id,
      submittedAt,
      threadId
    );
    await writeManifest(userId, manifest);
  } else {
    deferred.push(() =>
      syncOperatorParticipantSubmission(item, submittedAt, threadId)
    );
  }

  return { item, idempotent: false, deferred };
}

function assignmentFromValues(
  values: Record<string, FormValue>
): MethodRunAssignment {
  const wordTarget = values.word_target;
  return {
    title: String(values.title || ""),
    course: String(values.course || ""),
    dueDate: String(values.due_date || ""),
    wordTarget:
      typeof wordTarget === "number" ? wordTarget : Number(wordTarget) || 0,
    prompt: String(values.essay_prompt || ""),
    agentInstructions: String(values.agent_instructions || ""),
    group: String(values.group || ""),
  };
}

export function pendingInviteNamespace(email: string): string[] {
  const label = email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 128);
  return ["workspace_method_invites", label || "unknown"];
}

async function readPendingInvites(
  email: string
): Promise<PendingMethodInvite[]> {
  const item = await client().store.getItem(
    pendingInviteNamespace(email),
    "pending"
  );
  const value = item?.value as { invites?: PendingMethodInvite[] } | undefined;
  return Array.isArray(value?.invites) ? value.invites : [];
}

async function writePendingInvites(
  email: string,
  invites: PendingMethodInvite[]
): Promise<void> {
  await client().store.putItem(pendingInviteNamespace(email), "pending", {
    invites,
  });
}

function createParticipantRecord(
  userId: string,
  invite: {
    runId: string;
    operatorItemId: string;
    operatorId: string;
    methodSource: MethodSource;
    profileId: string;
    apparatusConfiguration: MethodParticipantWorkspaceItem["apparatusConfiguration"];
    assignment: MethodRunAssignment;
    source: MethodWorkspaceItem["source"];
  }
): MethodParticipantWorkspaceItem {
  const now = new Date().toISOString();
  return {
    id: `wi_${randomUUID()}`,
    ownerId: userId,
    status: "active",
    createdAt: now,
    updatedAt: now,
    source: invite.source,
    kind: "method_participant",
    runId: invite.runId,
    operatorItemId: invite.operatorItemId,
    operatorId: invite.operatorId,
    methodSource: invite.methodSource,
    profileId: invite.profileId,
    apparatusConfiguration: invite.apparatusConfiguration,
    assignment: invite.assignment,
  };
}

async function launchMethodRun(
  operatorId: string,
  manifest: WorkspaceManifest,
  item: MethodWorkspaceItem,
  values: Record<string, FormValue>,
  options: { profileId?: string; resolvedMarkdown: string }
): Promise<{
  item: MethodWorkspaceItem;
  deferred: Array<() => Promise<void>>;
}> {
  const emails = Array.isArray(values.participants)
    ? values.participants.map((email) => String(email).trim().toLowerCase())
    : [];
  if (emails.length === 0) {
    throw new FormValidationError([
      { fieldId: "participants", message: "Participants is required." },
    ]);
  }

  const resolved = resolveApparatusConfiguration({
    apparatusId: item.methodSource.id,
    profileId: options.profileId || item.profileId,
  });
  const assignment = assignmentFromValues(values);
  const launchedAt = new Date().toISOString();
  const runId = `run_${randomUUID()}`;
  const snapshot = {
    runId,
    operatorItemId: item.id,
    operatorId,
    methodSource: item.methodSource,
    profileId: resolved.apparatusProfileId,
    apparatusConfiguration: resolved.apparatusConfiguration,
    assignment,
    source: item.source,
  };

  const participants: MethodRunParticipant[] = [];
  const deferred: Array<() => Promise<void>> = [];

  let pendingInviteCount = 0;
  for (const [index, email] of emails.entries()) {
    const existing = await findUserByEmail(email);
    if (existing?.id) {
      const participantItem = createParticipantRecord(existing.id, snapshot);
      if (existing.id === operatorId) {
        manifest.items[participantItem.id] = participantItem;
      } else {
        deferred.push(() =>
          withUserLock(existing.id!, async () => {
            const participantManifest = await readManifest(existing.id!);
            participantManifest.initialized = true;
            participantManifest.items[participantItem.id] = participantItem;
            await writeManifest(existing.id!, participantManifest);
          })
        );
      }
      participants.push({
        email,
        userId: existing.id,
        itemId: participantItem.id,
        invitationStatus: "accepted",
        submissionStatus: "not_started",
      });
      await inviteWorkspaceParticipant(email, { correlationId: runId }).catch(
        (error) => {
          console.error(
            "[workspace] participant notify failed",
            runId,
            index,
            error
          );
        }
      );
      continue;
    }

    if (pendingInviteCount > 0 && INVITE_EMAIL_GAP_MS > 0) {
      await sleep(INVITE_EMAIL_GAP_MS);
    }
    await inviteWorkspaceParticipant(email, { correlationId: runId }).catch(
      (error) => {
        console.error("[workspace] invite email failed", runId, index, error);
      }
    );
    pendingInviteCount += 1;
    const pending: PendingMethodInvite = {
      email,
      runId,
      operatorId,
      operatorItemId: item.id,
      methodId: item.methodSource.id,
      methodVersion: item.methodSource.version,
      methodSource: item.methodSource,
      profileId: resolved.apparatusProfileId,
      apparatusConfiguration: resolved.apparatusConfiguration,
      assignment,
      createdAt: launchedAt,
    };
    await withUserLock(`invite:${email}`, async () => {
      const invites = await readPendingInvites(email);
      invites.push(pending);
      await writePendingInvites(email, invites);
    });
    participants.push({
      email,
      invitationStatus: "sent",
      submissionStatus: "not_started",
    });
  }

  item.submission = {
    status: "submitted",
    values,
    resolvedMarkdown: options.resolvedMarkdown,
    submittedAt: launchedAt,
  };
  item.profileId = resolved.apparatusProfileId;
  item.run = {
    id: runId,
    status: "in_progress",
    launchedAt,
    methodId: item.methodSource.id,
    methodVersion: item.methodSource.version,
    profileId: resolved.apparatusProfileId,
    apparatusConfiguration: resolved.apparatusConfiguration,
    assignment,
    participants,
  };
  item.updatedAt = launchedAt;
  manifest.items[item.id] = item;
  await writeManifest(operatorId, manifest);
  return { item, deferred };
}

export async function claimPendingMethodInvites(
  userId: string,
  email: string
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;

  const invites = await withUserLock(`invite:${normalized}`, async () =>
    readPendingInvites(normalized)
  );
  if (invites.length === 0) return;

  const claimed: PendingMethodInvite[] = [];
  for (const invite of invites) {
    let participantItemId: string | undefined;
    await withUserLock(userId, async () => {
      const manifest = await readManifest(userId);
      const already = Object.values(manifest.items).find(
        (item) =>
          item.kind === "method_participant" && item.runId === invite.runId
      );
      if (already) {
        participantItemId = already.id;
        return;
      }

      const participantItem = createParticipantRecord(userId, {
        runId: invite.runId,
        operatorItemId: invite.operatorItemId,
        operatorId: invite.operatorId,
        methodSource: enrichMethodSource(
          invite.methodSource || {
            id: invite.methodId,
            version: invite.methodVersion,
          }
        ),
        profileId: invite.profileId,
        apparatusConfiguration: invite.apparatusConfiguration,
        assignment: invite.assignment,
        source: {
          catalogRevision: "claimed",
          templateId: invite.methodId,
          templateVersion: invite.methodVersion,
          sourcePath: `methods/${invite.methodId}`,
        },
      });
      manifest.initialized = true;
      manifest.items[participantItem.id] = participantItem;
      await writeManifest(userId, manifest);
      participantItemId = participantItem.id;
    });

    if (participantItemId) {
      await withUserLock(invite.operatorId, async () => {
        const operatorManifest = await readManifest(invite.operatorId);
        const operatorItem = operatorManifest.items[invite.operatorItemId];
        if (operatorItem?.kind !== "method" || !operatorItem.run) return;
        const row = operatorItem.run.participants.find(
          (participant) => participant.email === normalized
        );
        if (row) {
          row.userId = userId;
          row.itemId = participantItemId;
          row.invitationStatus = "accepted";
        }
        operatorItem.updatedAt = new Date().toISOString();
        operatorManifest.items[operatorItem.id] = operatorItem;
        await writeManifest(invite.operatorId, operatorManifest);
      });
    }
    claimed.push(invite);
  }

  await withUserLock(`invite:${normalized}`, async () => {
    const remaining = (await readPendingInvites(normalized)).filter(
      (invite) =>
        !claimed.some(
          (done) =>
            done.runId === invite.runId &&
            done.operatorItemId === invite.operatorItemId
        )
    );
    await writePendingInvites(normalized, remaining);
  });
}

function isMissingThreadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
    message?: unknown;
  };
  return (
    candidate.status === 404 ||
    candidate.statusCode === 404 ||
    candidate.response?.status === 404 ||
    (typeof candidate.message === "string" &&
      /(?:404|not found)/i.test(candidate.message))
  );
}

export async function deleteWorkspaceItem(
  userId: string,
  itemId: string
): Promise<void> {
  return withUserLock(userId, async () => {
    const manifest = await readManifest(userId);
    const item = manifest.items[itemId];
    if (!item || item.ownerId !== userId || item.status !== "active") {
      throw new WorkspaceItemNotFoundError();
    }

    if (
      (item.kind === "markdown_template" ||
        item.kind === "form_template" ||
        item.kind === "method" ||
        item.kind === "method_participant") &&
      item.threadId
    ) {
      let thread: Awaited<ReturnType<Client["threads"]["get"]>> | undefined;
      try {
        thread = await client().threads.get(item.threadId);
      } catch (error) {
        if (!isMissingThreadError(error)) throw error;
      }

      if (thread) {
        const metadata = (thread.metadata || {}) as Record<string, unknown>;
        if (
          metadata.user_id !== userId ||
          metadata.workspace_item_id !== itemId
        ) {
          throw new WorkspaceThreadOwnershipError();
        }
        try {
          await client().threads.delete(item.threadId);
        } catch (error) {
          if (!isMissingThreadError(error)) throw error;
        }
      }
    }

    delete manifest.items[itemId];
    if (manifest.defaultItemId === itemId) delete manifest.defaultItemId;
    manifest.initialized = true;
    await writeManifest(userId, manifest);
  });
}

export async function getWorkspaceItem(
  userId: string,
  itemId: string
): Promise<WorkspaceItem | undefined> {
  const manifest = await readManifest(userId);
  const item = manifest.items[itemId];
  if (!item || item.ownerId !== userId || item.status !== "active") {
    return undefined;
  }
  if (item.kind === "method" && item.run) {
    return enrichWorkspaceItem(
      await reconcileMethodRunSubmissions(userId, item)
    );
  }
  return enrichWorkspaceItem(item);
}

export class WorkspaceReviewForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "WorkspaceReviewForbiddenError";
  }
}

export async function getMethodRun(
  userId: string,
  itemId: string
): Promise<MethodWorkspaceItem & { run: MethodRun }> {
  const item = await getWorkspaceItem(userId, itemId);
  if (!item || item.kind !== "method" || !item.run) {
    throw new WorkspaceItemNotFoundError();
  }
  return { ...item, run: item.run };
}

export async function getMethodParticipantReview(
  operatorId: string,
  operatorItemId: string,
  participantItemId: string
): Promise<{
  operatorItem: MethodWorkspaceItem;
  participant: MethodParticipantWorkspaceItem;
  thread: {
    id: string;
    messages: unknown[];
    artifact?: unknown;
    history: unknown[];
    metadata: Record<string, unknown>;
  } | null;
  trackingEnabled: boolean;
}> {
  const operatorItem = await getMethodRun(operatorId, operatorItemId);
  const row = operatorItem.run.participants.find(
    (participant) => participant.itemId === participantItemId
  );
  if (!row?.userId) {
    throw new WorkspaceItemNotFoundError();
  }

  const participantManifest = await readManifest(row.userId);
  const participant = participantManifest.items[participantItemId];
  if (
    !participant ||
    participant.kind !== "method_participant" ||
    participant.operatorId !== operatorId ||
    participant.operatorItemId !== operatorItemId
  ) {
    throw new WorkspaceItemNotFoundError();
  }

  const threadId = participant.threadId || row.threadId;
  let thread: {
    id: string;
    messages: unknown[];
    artifact?: unknown;
    history: unknown[];
    metadata: Record<string, unknown>;
  } | null = null;
  if (threadId) {
    try {
      const record = await client().threads.get(threadId);
      const state = await client().threads.getState(threadId);
      const values = (state?.values || {}) as Record<string, unknown>;
      let history: unknown[] = [];
      try {
        history = (await client().threads.getHistory(threadId)) as unknown[];
      } catch {
        history = [];
      }
      thread = {
        id: threadId,
        messages: Array.isArray(values.messages) ? values.messages : [],
        artifact: values.artifact,
        history,
        metadata: (record?.metadata || {}) as Record<string, unknown>,
      };
    } catch (error) {
      if (!isMissingThreadError(error)) throw error;
    }
  }

  return {
    operatorItem,
    participant,
    thread,
    trackingEnabled: participant.apparatusConfiguration.tracking !== false,
  };
}

/**
 * Resolve whether method tracking may be written/read for a thread.
 * Accepts either owner metadata key: authoritative `user_id` (server-stamped
 * via the proxy) preferred, with `supabase_user_id` (client ThreadProvider)
 * as fallback. This is tracking-policy only — thread ownership gates stay
 * strict on `user_id`.
 */
export async function resolveMethodTrackingAccess(
  threadId: string,
  userId: string
): Promise<{ allowed: boolean; canWrite: boolean; canRead: boolean }> {
  const denied = { allowed: false, canWrite: false, canRead: false };
  if (!threadId) return denied;
  try {
    const thread = await client().threads.get(threadId);
    const metadata = (thread?.metadata || {}) as Record<string, unknown>;
    const ownerId =
      typeof metadata.user_id === "string"
        ? metadata.user_id
        : typeof metadata.supabase_user_id === "string"
          ? metadata.supabase_user_id
          : undefined;
    const itemId = metadata.workspace_item_id;
    if (typeof ownerId !== "string" || typeof itemId !== "string")
      return denied;
    const manifest = await readManifest(ownerId);
    const item = manifest.items[itemId];
    if (item?.kind !== "method_participant") return denied;
    const allowed = item.apparatusConfiguration.tracking !== false;
    const isOwner = ownerId === userId;
    const isOperator = item.operatorId === userId;
    return {
      allowed,
      canWrite: allowed && isOwner,
      canRead: allowed && (isOwner || isOperator),
    };
  } catch {
    return denied;
  }
}

export async function reconcileWorkspaceItemThread(
  userId: string,
  itemId: string,
  threadId: string | null
): Promise<WorkspaceItem> {
  return withUserLock(userId, async () => {
    const manifest = await readManifest(userId);
    const item = manifest.items[itemId];
    if (!item || item.ownerId !== userId || item.status !== "active") {
      throw new WorkspaceItemNotFoundError();
    }
    if (
      item.kind !== "markdown_template" &&
      item.kind !== "form_template" &&
      item.kind !== "method" &&
      item.kind !== "method_participant"
    ) {
      throw new WorkspaceItemThreadNotAllowedError();
    }

    if (threadId) {
      const thread = await client().threads.get(threadId);
      const metadata = (thread?.metadata || {}) as Record<string, unknown>;
      if (
        metadata.user_id !== userId ||
        metadata.workspace_item_id !== itemId
      ) {
        throw new WorkspaceThreadOwnershipError();
      }
    }

    item.threadId = threadId || undefined;
    item.updatedAt = new Date().toISOString();
    manifest.items[item.id] = item;
    await writeManifest(userId, manifest);
    return item;
  });
}
