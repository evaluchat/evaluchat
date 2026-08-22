# ADR-0004: Retain no private repository content outside the repository

- Status: Accepted
- Date: 2026-08-22
- Release: v0.8

## Context

The private Git repository is the source of truth for research artifacts and
their ordinary history. Copying artifact content into existing workspace,
agent, observability, search, or backup systems would create hidden secondary
stores and defeat deletion and access revocation at the repository boundary.

## Decision

Repository bodies, frontmatter, evidence, ledger snapshots, seal files, and
their normal Git history live **only** in the bound private repository.

Evaluchat may retain only:

- AES-256-GCM-encrypted credentials;
- numeric GitHub repository and installation IDs;
- encrypted repository display metadata;
- the managed branch and commit/blob pointers;
- cryptographic hashes;
- idempotency and reconciliation state;
- webhook delivery IDs; and
- publication references.

Evaluchat never retains artifact bodies, derived title indexes, commit
messages, raw webhook payloads, or private-content excerpts. Private content is
excluded from LangGraph Store, thread checkpoints, tracing, logs, telemetry,
analytics, backups, search indexes, queues, dead-letter records, and job
payloads. Error records use stable artifact IDs and non-content error codes.

Webhook HMAC is validated against the raw request bytes before parsing. Only
the minimum fields needed for an installation, installation-repositories, or
push event are extracted. The raw body is discarded, and `X-GitHub-Delivery`
is retained only as an idempotency key.

## Consequences

- A repository deletion or revoked grant does not leave an Evaluchat content
  archive behind.
- Private repository AI must be stateless, keep conversation in browser memory,
  and run with tracing disabled. If zero-trace behavior cannot be demonstrated,
  AI remains disabled while manual editing remains available.
- Jobs must carry IDs, pointers, and hashes and fetch authorized bytes just in
  time; content cannot be recovered from a retry queue.
- Operational debugging cannot depend on body excerpts or commit messages.
