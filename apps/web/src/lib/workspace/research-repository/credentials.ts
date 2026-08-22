import { createHash, timingSafeEqual } from "node:crypto";
import { Client } from "@langchain/langgraph-sdk";
import {
  decryptGithubResearchSecret,
  encryptGithubResearchSecret,
  type GithubResearchEncryptedEnvelope,
} from "@opencanvas/shared/github-research/crypto";
import { LANGGRAPH_API_URL } from "@/constants";
import type { GithubResearchOAuthTokens } from "./github-app";

export const GITHUB_RESEARCH_CREDENTIALS_ROOT = "github_research_credentials";
export const GITHUB_RESEARCH_CREDENTIALS_KEY = "credentials";

const OAUTH_STATE_TTL_MINUTES = 10;
const WEBHOOK_DELIVERY_TTL_MINUTES = 7 * 24 * 60;

export type GithubResearchCredentialRecord = {
  accessTokenEnc: GithubResearchEncryptedEnvelope;
  refreshTokenEnc?: GithubResearchEncryptedEnvelope;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  installationId?: number;
  repositoryIds: number[];
  displayMetadataEnc: GithubResearchEncryptedEnvelope;
  githubUserIdHash: string;
  oauthCodeHash?: string;
  connectedAt: string;
  updatedAt: string;
  lastPush?: {
    repositoryId?: number;
    refHash?: string;
    beforeHash?: string;
    afterHash?: string;
    receivedAt: string;
  };
};

export type DecryptedGithubResearchCredentials = {
  tokens: GithubResearchOAuthTokens;
  installationId?: number;
  repositoryIds: number[];
  displayMetadata: Record<string, unknown>;
};

type StoredOAuthState = {
  stateHash: string;
  verifierEnc: GithubResearchEncryptedEnvelope;
  expiresAt: string;
};

function client(): Client {
  return new Client({
    apiUrl: LANGGRAPH_API_URL,
    apiKey: process.env.LANGCHAIN_API_KEY,
  });
}

function encryptionKey(): string {
  const value = process.env.GITHUB_RESEARCH_TOKEN_ENCRYPTION_KEY?.trim();
  if (!value) {
    throw new Error("GITHUB_RESEARCH_TOKEN_ENCRYPTION_KEY is required");
  }
  return value;
}

export function githubResearchCredentialsNamespace(userId: string): string[] {
  if (!userId || userId.includes(".")) throw new Error("Invalid user id");
  return [GITHUB_RESEARCH_CREDENTIALS_ROOT, userId];
}

export function hashGithubCredentialIdentifier(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function equalHashes(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function stateKey(stateHash: string): string {
  return `oauth_state:${stateHash}`;
}

function webhookDeliveryKey(deliveryHash: string): string {
  return `webhook_delivery:${deliveryHash}`;
}

function normaliseRecord(
  value: unknown
): GithubResearchCredentialRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<GithubResearchCredentialRecord>;
  if (
    !candidate.accessTokenEnc ||
    !candidate.displayMetadataEnc ||
    !Array.isArray(candidate.repositoryIds) ||
    typeof candidate.githubUserIdHash !== "string" ||
    typeof candidate.connectedAt !== "string" ||
    typeof candidate.updatedAt !== "string"
  ) {
    return null;
  }
  return candidate as GithubResearchCredentialRecord;
}

export async function storeGithubOAuthState(
  userId: string,
  state: string,
  verifier: string
): Promise<void> {
  const stateHash = hashGithubCredentialIdentifier(state);
  const expiresAt = new Date(
    Date.now() + OAUTH_STATE_TTL_MINUTES * 60_000
  ).toISOString();
  await client().store.putItem(
    githubResearchCredentialsNamespace(userId),
    stateKey(stateHash),
    {
      stateHash,
      verifierEnc: encryptGithubResearchSecret(verifier, encryptionKey()),
      expiresAt,
    },
    { index: false, ttl: OAUTH_STATE_TTL_MINUTES }
  );
}

/** Read and delete an OAuth state before returning its PKCE verifier. */
export async function consumeGithubOAuthState(
  userId: string,
  state: string
): Promise<string | null> {
  const namespace = githubResearchCredentialsNamespace(userId);
  const stateHash = hashGithubCredentialIdentifier(state);
  const key = stateKey(stateHash);
  const item = await client().store.getItem(namespace, key);
  if (!item) return null;
  await client().store.deleteItem(namespace, key);

  const value = item.value as Partial<StoredOAuthState> | undefined;
  if (
    !value ||
    typeof value.stateHash !== "string" ||
    !equalHashes(value.stateHash, stateHash) ||
    typeof value.expiresAt !== "string" ||
    new Date(value.expiresAt).getTime() <= Date.now() ||
    !value.verifierEnc
  ) {
    return null;
  }
  return decryptGithubResearchSecret(value.verifierEnc, encryptionKey());
}

export async function storeGithubResearchCredentials(
  userId: string,
  input: {
    tokens: GithubResearchOAuthTokens;
    installationId?: number;
    repositoryIds: number[];
    displayMetadata: Record<string, unknown> & { githubUserId: number };
    oauthCode?: string;
  }
): Promise<void> {
  const key = encryptionKey();
  const now = new Date().toISOString();
  const record: GithubResearchCredentialRecord = {
    accessTokenEnc: encryptGithubResearchSecret(input.tokens.accessToken, key),
    refreshTokenEnc: input.tokens.refreshToken
      ? encryptGithubResearchSecret(input.tokens.refreshToken, key)
      : undefined,
    accessTokenExpiresAt: input.tokens.expiresAt,
    refreshTokenExpiresAt: input.tokens.refreshTokenExpiresAt,
    installationId: input.installationId,
    repositoryIds: [...new Set(input.repositoryIds)].sort(
      (left, right) => left - right
    ),
    displayMetadataEnc: encryptGithubResearchSecret(
      JSON.stringify(input.displayMetadata),
      key
    ),
    githubUserIdHash: hashGithubCredentialIdentifier(
      String(input.displayMetadata.githubUserId)
    ),
    oauthCodeHash: input.oauthCode
      ? hashGithubCredentialIdentifier(input.oauthCode)
      : undefined,
    connectedAt: now,
    updatedAt: now,
  };
  await client().store.putItem(
    githubResearchCredentialsNamespace(userId),
    GITHUB_RESEARCH_CREDENTIALS_KEY,
    record,
    { index: ["installationId", "githubUserIdHash"] }
  );
}

export async function readGithubResearchCredentialRecord(
  userId: string
): Promise<GithubResearchCredentialRecord | null> {
  const item = await client().store.getItem(
    githubResearchCredentialsNamespace(userId),
    GITHUB_RESEARCH_CREDENTIALS_KEY
  );
  return normaliseRecord(item?.value);
}

export async function readGithubResearchCredentials(
  userId: string
): Promise<DecryptedGithubResearchCredentials | null> {
  const record = await readGithubResearchCredentialRecord(userId);
  if (!record) return null;
  const key = encryptionKey();
  const rawMetadata = decryptGithubResearchSecret(
    record.displayMetadataEnc,
    key
  );
  const metadata = JSON.parse(rawMetadata) as unknown;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Invalid encrypted GitHub display metadata");
  }
  return {
    tokens: {
      accessToken: decryptGithubResearchSecret(record.accessTokenEnc, key),
      refreshToken: record.refreshTokenEnc
        ? decryptGithubResearchSecret(record.refreshTokenEnc, key)
        : undefined,
      expiresAt: record.accessTokenExpiresAt,
      refreshTokenExpiresAt: record.refreshTokenExpiresAt,
    },
    installationId: record.installationId,
    repositoryIds: record.repositoryIds,
    displayMetadata: metadata as Record<string, unknown>,
  };
}

export async function deleteGithubResearchCredentials(
  userId: string
): Promise<void> {
  await client().store.deleteItem(
    githubResearchCredentialsNamespace(userId),
    GITHUB_RESEARCH_CREDENTIALS_KEY
  );
}

export async function findGithubCredentialOwnersByInstallationId(
  installationId: number
): Promise<string[]> {
  const response = await client().store.searchItems(
    [GITHUB_RESEARCH_CREDENTIALS_ROOT],
    { filter: { installationId }, limit: 100 }
  );
  return response.items
    .filter(
      (item) =>
        item.key === GITHUB_RESEARCH_CREDENTIALS_KEY &&
        item.value?.installationId === installationId &&
        item.namespace[0] === GITHUB_RESEARCH_CREDENTIALS_ROOT &&
        typeof item.namespace[1] === "string"
    )
    .map((item) => item.namespace[1]);
}

export async function claimGithubWebhookDelivery(
  userId: string,
  deliveryId: string
): Promise<boolean> {
  const namespace = githubResearchCredentialsNamespace(userId);
  const deliveryHash = hashGithubCredentialIdentifier(deliveryId);
  const key = webhookDeliveryKey(deliveryHash);
  if (await client().store.getItem(namespace, key)) return false;
  await client().store.putItem(
    namespace,
    key,
    { deliveryHash, receivedAt: new Date().toISOString() },
    { index: false, ttl: WEBHOOK_DELIVERY_TTL_MINUTES }
  );
  return true;
}

async function updateCredentialRecord(
  userId: string,
  update: (
    record: GithubResearchCredentialRecord
  ) => GithubResearchCredentialRecord
): Promise<void> {
  const record = await readGithubResearchCredentialRecord(userId);
  if (!record) return;
  await client().store.putItem(
    githubResearchCredentialsNamespace(userId),
    GITHUB_RESEARCH_CREDENTIALS_KEY,
    { ...update(record), updatedAt: new Date().toISOString() },
    { index: ["installationId", "githubUserIdHash"] }
  );
}

export async function updateGithubInstallation(
  userId: string,
  installationId: number,
  repositoryIds: number[]
): Promise<void> {
  await updateCredentialRecord(userId, (record) => ({
    ...record,
    installationId,
    repositoryIds: [...new Set(repositoryIds)].sort(
      (left, right) => left - right
    ),
  }));
}

export async function updateGithubInstallationRepositories(
  userId: string,
  addedRepositoryIds: number[],
  removedRepositoryIds: number[]
): Promise<void> {
  await updateCredentialRecord(userId, (record) => {
    const repositoryIds = new Set(record.repositoryIds);
    for (const id of addedRepositoryIds) repositoryIds.add(id);
    for (const id of removedRepositoryIds) repositoryIds.delete(id);
    return {
      ...record,
      repositoryIds: [...repositoryIds].sort((left, right) => left - right),
    };
  });
}

export async function recordGithubPush(
  userId: string,
  input: {
    repositoryId?: number;
    ref?: string;
    before?: string;
    after?: string;
  }
): Promise<void> {
  await updateCredentialRecord(userId, (record) => ({
    ...record,
    lastPush: {
      repositoryId: input.repositoryId,
      refHash: input.ref
        ? hashGithubCredentialIdentifier(input.ref)
        : undefined,
      beforeHash: input.before
        ? hashGithubCredentialIdentifier(input.before)
        : undefined,
      afterHash: input.after
        ? hashGithubCredentialIdentifier(input.after)
        : undefined,
      receivedAt: new Date().toISOString(),
    },
  }));
}
