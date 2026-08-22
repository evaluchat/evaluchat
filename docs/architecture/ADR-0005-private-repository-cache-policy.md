# ADR-0005: Keep private repository content in browser memory only

- Status: Accepted
- Date: 2026-08-22
- Release: v0.8

## Context

Even without server retention, HTTP caches and browser persistence can leave
private artifacts on shared machines, CDN nodes, framework caches, service
workers, crash recovery, or future sessions.

## Decision

Every response that contains private repository content, content-derived
previews, or content-bearing errors sends:

```http
Cache-Control: no-store
```

Routes are dynamically evaluated and excluded from framework, reverse-proxy,
and CDN response caches. Repository requests must not opt into revalidation,
incremental static regeneration, or service-worker caching.

Decrypted repository content and uncommitted edits exist in browser memory
only. They are not written to `localStorage`, `sessionStorage`, IndexedDB, the
Cache API, client databases, persisted state stores, analytics buffers, or
offline drafts. Navigation and unload warn while a draft is dirty, but the
warning does not persist the draft.

Client code clears in-memory content on disconnect, sign-out, workspace
switch, authorization loss, and terminal repository state. Browser extensions,
screen capture, swap, and compromised endpoints remain outside guarantees that
a web application can enforce and are disclosed as residual risk.

## Consequences

- Reloading loses uncommitted work; the product must make “Not committed” state
  and explicit **Commit changes** behavior clear.
- Offline editing and cross-device draft recovery are intentionally unavailable
  in v1.
- Later route tests must verify `no-store` on successful and error responses;
  this ADR adds no route or UI implementation.
