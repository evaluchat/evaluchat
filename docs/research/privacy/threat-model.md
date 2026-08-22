# GitHub research workspaces threat model

- Status: Ratified for repository contract v1.0
- Date: 2026-08-22
- Scope: Evaluchat v0.8 private GitHub research workspaces

## Security and privacy objective

The researcher's selected private Git repository is the only durable home for
repository bodies, frontmatter, evidence, ledger snapshots, seal manifests,
and normal Git history. Evaluchat may retain encrypted credentials and bounded
IDs, pointers, hashes, and idempotency/publication state, but no private
artifact content, commit messages, title indexes, or raw webhook payloads.

The model protects against accidental secondary retention, cross-repository
authorization, OAuth replay, credential disclosure from an application data
breach, over-privileged publication, and stale or replayed operations. It does
not claim to protect content displayed on a compromised user device, content a
researcher deliberately publishes, or data retained independently by GitHub.

## Assets and trust boundaries

Protected assets are private repository bytes and metadata, GitHub access and
refresh tokens, installation tokens, uncommitted browser drafts, exact seal
inputs, and the researcher's intent to commit or publish.

The principal boundaries are:

1. Browser to Evaluchat server over HTTPS.
2. Evaluchat server to GitHub APIs and webhook delivery.
3. Encrypted credential storage to the separately managed envelope keys.
4. The Research Workspace App's selected private installations to the
   Catalogue Publisher App's sole `evaluchat/research` installation.
5. Transient content processing to systems that may persist data, including
   LangGraph, tracing, logs, telemetry, queues, caches, and backups.

## Required invariants

- Browser requests identify a workspace and stable artifact ID, never a
  caller-selected repository name or filesystem path.
- The server resolves repository ID, installation ID, branch, and managed path
  from the authenticated binding on every operation.
- The workspace app has Metadata read and Contents read/write only on selected
  private repositories. The publisher app has Metadata read, Contents write,
  and Pull requests write only on `evaluchat/research`.
- Private content is never durable in Evaluchat. Content responses are
  `Cache-Control: no-store` and browser-memory-only.
- Commits require an explicit researcher action and a base commit SHA.
  Publication requires a separate exact-byte preview and confirmation and can
  create only a draft public pull request.
- Installation tokens are just-in-time and ephemeral. User tokens are
  encrypted in a versioned AES-256-GCM envelope and refreshed atomically.

## Leak vectors and controls

| Vector                                     | Failure or abuse                                                                                 | Required control                                                                                                                                                           | Residual risk                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| LangGraph checkpoints and Store            | Prompts, repository bodies, or assistant output become durable thread state                      | Repository mode uses stateless runs with no checkpointer or Store writes; pass only transient content; integration tests must prove the dedicated graph has no persistence | A future graph change can regress the invariant; repository AI stays disabled if zero-retention cannot be proven |
| Tracing and model observability            | Prompt, completion, tool input, or exception attributes leave Evaluchat                          | Disable tracing for the dedicated private graph and all child operations; do not attach content to spans or errors                                                         | Model providers process submitted bytes under their own terms; this must be disclosed before AI use              |
| Browser `localStorage` and persisted state | Private bodies or drafts survive sign-out and sync to another device                             | Keep content and conversation in memory only; prohibit `localStorage`, `sessionStorage`, IndexedDB, Cache API, service-worker caches, and persisted state middleware       | Extensions, crash dumps, swap, screenshots, and a compromised browser remain endpoint risks                      |
| HTTP, framework, CDN, and proxy caches     | Authenticated content is reused or stored outside the repository                                 | Send `Cache-Control: no-store` on content-bearing success and error responses; force dynamic handling; disable CDN/framework/service-worker caching                        | An incorrectly configured intermediary that ignores directives remains an operational risk                       |
| Application logs and exceptions            | Bodies, titles, commit messages, tokens, or webhook payloads are serialized                      | Structured allowlist logging with IDs, hashes, sizes, status codes, and non-content error codes only; redact authorization headers and query values                        | Dependency or platform logs require periodic configuration audits                                                |
| Analytics and telemetry                    | Filenames, titles, content fragments, or high-cardinality paths reveal research topics           | Emit only coarse feature events and numeric/bounded identifiers; prohibit repository names, paths, titles, content, prompts, and commit messages                           | Event timing and counts can still reveal activity patterns                                                       |
| Queues, retries, and dead-letter storage   | Content-bearing jobs become an undeclared archive                                                | Jobs contain operation IDs, repository pointers, hashes, and idempotency keys only; refetch bytes after authorization; never enqueue bodies or raw webhooks                | A retry can fail after access revocation, by design                                                              |
| Backups and search indexes                 | Secondary durable copies defeat repository deletion or access loss                               | Exclude repository bodies, title indexes, commit messages, and raw payloads from databases and indexes, so normal backups contain only allowed metadata                    | Encrypted credentials and activity metadata remain until their defined deletion period                           |
| Webhooks                                   | Raw push payload leaks names/messages, or a forged/replayed delivery mutates state               | Verify HMAC before parsing, allowlist event types, extract minimal IDs/SHAs, deduplicate delivery ID, discard raw payload                                                  | Delivery IDs and timing remain operational metadata                                                              |
| Publication                                | Private owner, repository, branch, workspace, installation, or token metadata enters a public PR | Build a dependency-closed projection from the exact seal commit; schema-reject private metadata; show exact public bytes and destination; publisher creates draft PR only  | Selected artifact text may itself identify a person; researcher review remains essential                         |

Repository content must also be excluded from request capture, APM breadcrumbs,
feature-flag context, replay/session-recording tools, support tooling, metrics
labels, and ad-hoc operator diagnostics.

## Permission minimization and confused-deputy resistance

The two-app design is mandatory, not a deployment preference. The private app
does not receive Administration, Workflows, Pull requests, email, or broad
account access. The publisher app is not installed on private repositories. An
installation token is requested only after checking that the stored numeric
repository and installation IDs match the authenticated workspace binding and
the expected app.

User tokens are limited by the intersection of the user's GitHub access and the
app installation's permissions. A server-side check still verifies private
visibility, the `evaluchat/workspace` branch, layout compatibility, and write
access before each mutation. Repository rename or transfer follows the stable
numeric repository ID. Deletion, visibility becoming public, permission loss,
branch deletion, force-push detection, or required-protection failure blocks
writes and requires explicit recovery.

Public publication accepts no browser-supplied destination repository. The
publisher app resolves its sole installation and the fixed catalogue
repository from server configuration. Deterministic branch and operation IDs
make retries idempotent; a new or changed seal requires a new exact-byte
confirmation.

## OAuth and token threats

OAuth uses PKCE `S256` and high-entropy, expiring, one-time state bound to the
authenticated Evaluchat user and flow. Atomic state consumption prevents replay
and login CSRF. Codes, verifiers, state values, tokens, and authorization
headers are never logged or sent to telemetry.

User access and refresh tokens are separately encrypted using AES-256-GCM with
a unique nonce, envelope version, `kid`, authentication tag, and contextual
authenticated data. Envelope keys are stored outside the application database.
Authentication failure or an unknown key ID is a hard credential failure, not
a plaintext or stale-key fallback.

## Revocation, expiry, and rotation failure modes

GitHub currently defaults expiring user access tokens to eight hours and
refresh tokens to six months. Implementations must use the expiries returned by
GitHub rather than calculating from those defaults.

| Failure mode                                                     | Required response                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Access token expires during an operation                         | Do not retry the mutation blindly. Refresh under a per-credential lock, then retry only through the existing idempotent operation and original base SHA.                                                                             |
| Two requests refresh concurrently                                | Serialize or compare-and-swap the credential version. Only one rotated access/refresh pair may commit; a loser reloads the new pair rather than restoring its stale pair.                                                            |
| GitHub rotates the refresh token but the local transaction fails | Treat the outcome as ambiguous and block repository operations. Reconcile once if the new pair is recoverable in the same atomic boundary; otherwise require reauthorization. Never fall back to the old refresh token indefinitely. |
| Refresh token expires or is revoked                              | Mark the binding authorization-required/read-only, clear unusable encrypted credentials, and require a fresh OAuth grant. Preserve uncommitted browser text only long enough for the user to copy/download it.                       |
| User revokes the app or repository grant                         | Stop reads and writes as soon as GitHub reports revocation or reconciliation detects it. Invalidate clean sessions and discard in-memory content.                                                                                    |
| Installation is suspended or deleted                             | Block all repository operations and do not mint installation tokens. Retain only the minimum binding state needed to explain recovery or disconnect.                                                                                 |
| Envelope `kid` is unavailable                                    | Fail closed and alert operators without logging ciphertext or content. Restore the key through controlled key management or require reauthorization.                                                                                 |
| AES-GCM authentication fails                                     | Quarantine the credential record as corrupt, do not attempt partial decryption, and require recovery/reauthorization.                                                                                                                |
| Refresh response is missing a rotated token or expiry            | Reject the response and keep no partially updated credential state. Block and reauthorize if a safe retry cannot be established.                                                                                                     |
| Revocation races a commit or publish                             | The GitHub mutation may have succeeded before revocation. Reconcile by operation ID and GitHub object/PR pointer; never infer success by replaying content.                                                                          |

Disconnect revokes credentials where GitHub supports it, deletes the encrypted
credential records and binding display metadata, invalidates sessions, and
clears browser memory. Failure to call GitHub revocation is reported, but local
credential deletion still proceeds; the user is directed to revoke the app in
GitHub.

## Verification obligations for later issues

- Prove repository mode performs no LangGraph checkpoint, tracing, log,
  telemetry, local-storage, cache, backup, or queue body writes. Check request
  capture, APM breadcrumbs, feature-flag context, session recording, support
  tooling, metrics labels, and operator diagnostics explicitly as independent
  leak sinks.
- Assert permission manifests for both apps and reject cross-domain
  installations.
- Exercise OAuth state replay, wrong-user state, verifier mismatch, and expiry.
- Exercise token expiry, concurrent refresh, rotated-token transaction failure,
  revocation, unknown `kid`, and authentication-tag failure.
- Verify `Cache-Control: no-store` on every content-bearing success and error.
- Verify unsupported layout majors and later unsupported minors are read-only.
- Inspect a generated public draft PR for private metadata and confirm the app
  cannot ready, approve, or merge it.
