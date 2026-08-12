import { Client } from "@langchain/langgraph-sdk";
import { randomUUID } from "node:crypto";
import { LANGGRAPH_API_URL } from "@/constants";
import {
  DEFAULT_WORKSPACE_TEMPLATE_ID,
  WorkspaceItem,
  WorkspaceManifest,
} from "./types";
import { getTemplateById, getTemplateCatalog } from "./template-catalog";

const MANIFEST_KEY = "manifest";
const locks = new Map<string, Promise<void>>();

function client(): Client {
  return new Client({
    apiUrl: LANGGRAPH_API_URL,
    apiKey: process.env.LANGCHAIN_API_KEY,
  });
}

function namespace(userId: string): string[] {
  return ["workspace_items", userId];
}

async function readManifest(userId: string): Promise<WorkspaceManifest> {
  const item = await client().store.getItem(namespace(userId), MANIFEST_KEY);
  const value = item?.value as Partial<WorkspaceManifest> | undefined;
  if (!value || typeof value !== "object" || !value.items) {
    return { items: {} };
  }
  return {
    defaultItemId:
      typeof value.defaultItemId === "string" ? value.defaultItemId : undefined,
    items: value.items as Record<string, WorkspaceItem>,
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
  if (!template || template.id !== DEFAULT_WORKSPACE_TEMPLATE_ID) {
    throw new Error("Unsupported workspace template");
  }
  const catalog = getTemplateCatalog();
  return {
    catalogRevision: catalog.catalogRevision,
    templateVersion: template.version,
    sourcePath: template.sourcePath,
    templateSnapshot: {
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
  return {
    id: `wi_${randomUUID()}`,
    ownerId: userId,
    kind: "markdown_template",
    status: "active",
    createdAt: now,
    updatedAt: now,
    source: {
      catalogRevision: snapshot.catalogRevision,
      templateId: DEFAULT_WORKSPACE_TEMPLATE_ID,
      templateVersion: snapshot.templateVersion,
      sourcePath: snapshot.sourcePath,
    },
    templateSnapshot: snapshot.templateSnapshot,
  };
}

export async function ensureDefaultWorkspaceItem(
  userId: string
): Promise<WorkspaceItem> {
  return withUserLock(userId, async () => {
    const manifest = await readManifest(userId);
    const existing = manifest.defaultItemId
      ? manifest.items[manifest.defaultItemId]
      : Object.values(manifest.items).sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt)
        )[0];
    if (existing) {
      if (!manifest.defaultItemId) {
        manifest.defaultItemId = existing.id;
        await writeManifest(userId, manifest);
      }
      return existing;
    }

    const item = createItem(userId, DEFAULT_WORKSPACE_TEMPLATE_ID);
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
    manifest.items[item.id] = item;
    await writeManifest(userId, manifest);
    return item;
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
      throw new Error("Workspace item not found");
    }

    if (threadId) {
      const thread = await client().threads.get(threadId);
      const metadata = (thread?.metadata || {}) as Record<string, unknown>;
      if (
        metadata.user_id !== userId ||
        metadata.workspace_item_id !== itemId
      ) {
        throw new Error("Thread does not belong to workspace item");
      }
    }

    item.threadId = threadId || undefined;
    item.updatedAt = new Date().toISOString();
    manifest.items[item.id] = item;
    await writeManifest(userId, manifest);
    return item;
  });
}
