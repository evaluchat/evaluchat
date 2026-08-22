import { createHash, randomUUID } from "node:crypto";
import { Client } from "@langchain/langgraph-sdk";
import {
  RepositoryOperationSchema,
  type RepositoryOperation,
} from "@opencanvas/shared/research-repository";
import { LANGGRAPH_API_URL } from "@/constants";
import { withUserLock } from "./credentials";

export const GITHUB_RESEARCH_OPERATIONS_ROOT = "github_research_operations";

export class RepositoryOperationInProgressError extends Error {
  constructor(public readonly operation: RepositoryOperation) {
    super("A repository operation with this idempotency key is in progress");
    this.name = "RepositoryOperationInProgressError";
  }
}

function client(): Client {
  return new Client({
    apiUrl: LANGGRAPH_API_URL,
    apiKey: process.env.LANGCHAIN_API_KEY,
  });
}

export function repositoryOperationsNamespace(userId: string): string[] {
  if (!userId || userId.includes(".")) throw new Error("Invalid user id");
  return [GITHUB_RESEARCH_OPERATIONS_ROOT, userId];
}

function operationKey(idempotencyKey: string): string {
  return `idempotency-${createHash("sha256")
    .update(idempotencyKey)
    .digest("hex")}`;
}

async function readOperation(
  userId: string,
  idempotencyKey: string
): Promise<RepositoryOperation | undefined> {
  const item = await client().store.getItem(
    repositoryOperationsNamespace(userId),
    operationKey(idempotencyKey)
  );
  const parsed = RepositoryOperationSchema.safeParse(item?.value);
  return parsed.success ? parsed.data : undefined;
}

export async function claimRepositoryOperation(
  userId: string,
  input: {
    workspaceId: string;
    kind: RepositoryOperation["kind"];
    idempotencyKey: string;
    artifactIds: string[];
    baseCommitSha?: string;
  }
): Promise<RepositoryOperation> {
  return withUserLock(userId, async () => {
    const existing = await readOperation(userId, input.idempotencyKey);
    if (existing?.status === "succeeded") return existing;
    if (existing?.status === "pending" || existing?.status === "running") {
      throw new RepositoryOperationInProgressError(existing);
    }

    const now = new Date().toISOString();
    const operation = RepositoryOperationSchema.parse({
      operationId: `operation-${randomUUID()}`,
      workspaceId: input.workspaceId,
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
      status: "pending",
      artifactIds: input.artifactIds,
      baseCommitSha: input.baseCommitSha,
      createdAt: now,
      updatedAt: now,
    });
    await client().store.putItem(
      repositoryOperationsNamespace(userId),
      operationKey(input.idempotencyKey),
      operation
    );
    return operation;
  });
}

export async function completeRepositoryOperation(
  userId: string,
  operation: RepositoryOperation,
  resultCommitSha: string
): Promise<RepositoryOperation> {
  return withUserLock(userId, async () => {
    const current = await readOperation(userId, operation.idempotencyKey);
    if (!current || current.operationId !== operation.operationId) {
      throw new Error("Repository operation is no longer current");
    }
    const completed = RepositoryOperationSchema.parse({
      ...current,
      status: "succeeded",
      resultCommitSha,
      errorCode: undefined,
      updatedAt: new Date().toISOString(),
    });
    await client().store.putItem(
      repositoryOperationsNamespace(userId),
      operationKey(operation.idempotencyKey),
      completed
    );
    return completed;
  });
}

export async function failRepositoryOperation(
  userId: string,
  operation: RepositoryOperation,
  errorCode: string
): Promise<RepositoryOperation> {
  return withUserLock(userId, async () => {
    const current = await readOperation(userId, operation.idempotencyKey);
    if (!current || current.operationId !== operation.operationId) {
      throw new Error("Repository operation is no longer current");
    }
    const failed = RepositoryOperationSchema.parse({
      ...current,
      status: "failed",
      resultCommitSha: undefined,
      errorCode,
      updatedAt: new Date().toISOString(),
    });
    await client().store.putItem(
      repositoryOperationsNamespace(userId),
      operationKey(operation.idempotencyKey),
      failed
    );
    return failed;
  });
}
