import { Client } from "@langchain/langgraph-sdk";
import { randomUUID } from "node:crypto";
import { LANGGRAPH_API_URL } from "@/constants";
import {
  FormValidationError,
  resolveFormMarkdown,
  submissionEquals,
  validateFormValues,
} from "./form-validation";
import type { FormValue } from "./types";
import {
  DEFAULT_WORKSPACE_TEMPLATE_ID,
  MarkdownWorkspaceItem,
  WorkspaceItem,
  WorkspaceManifest,
} from "./types";
import { getTemplateById, getTemplateCatalog } from "./template-catalog";

const MANIFEST_KEY = "manifest";
const locks = new Map<string, Promise<void>>();

export class WorkspaceItemNotFoundError extends Error {
  constructor() {
    super("Workspace item not found");
    this.name = "WorkspaceItemNotFoundError";
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
      } as WorkspaceItem["templateSnapshot"],
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

async function withUserLock<T>(
  userId: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = locks.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(userId, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (locks.get(userId) === current) locks.delete(userId);
  }
}

function snapshotFromTemplate(templateId: string) {
  const template = getTemplateById(templateId);
  if (!template) throw new Error("Unsupported workspace template");
  const catalog = getTemplateCatalog();

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

export async function listWorkspaceItems(
  userId: string
): Promise<WorkspaceItem[]> {
  const manifest = await readManifest(userId);
  return Object.values(manifest.items).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
}

export async function createWorkspaceItem(
  userId: string,
  templateId: string
): Promise<WorkspaceItem> {
  return withUserLock(userId, async () => {
    const manifest = await readManifest(userId);
    const item = createItem(userId, templateId);
    manifest.initialized = true;
    manifest.items[item.id] = item;
    await writeManifest(userId, manifest);
    return item;
  });
}

export async function submitWorkspaceForm(
  userId: string,
  itemId: string,
  rawValues: unknown
): Promise<{ item: WorkspaceItem; idempotent: boolean }> {
  return withUserLock(userId, async () => {
    const manifest = await readManifest(userId);
    const item = manifest.items[itemId];
    if (!item || item.ownerId !== userId || item.status !== "active") {
      throw new WorkspaceItemNotFoundError();
    }
    if (item.kind !== "form_template") {
      throw new WorkspaceItemNotFoundError();
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

    if (item.submission) {
      if (submissionEquals(item.submission, values, resolvedMarkdown)) {
        return { item, idempotent: true };
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
    return { item, idempotent: false };
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
      (item.kind === "markdown_template" || item.kind === "form_template") &&
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
  return item?.ownerId === userId && item.status === "active"
    ? item
    : undefined;
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
    if (item.kind !== "markdown_template" && item.kind !== "form_template") {
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
