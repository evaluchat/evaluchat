# ADR-0002: Protect the GitHub App OAuth web flow with PKCE and one-time state

- Status: Accepted
- Date: 2026-08-22
- Release: v0.8

## Context

Product sign-in does not grant private-repository access. The Research
Workspace App requires a separate GitHub App user authorization. Authorization
codes and callback parameters can be intercepted, replayed, or attached to the
wrong signed-in Evaluchat user unless the callback is bound to the initiating
browser session.

## Decision

The Research Workspace App uses GitHub's OAuth web application flow with:

- a fresh high-entropy PKCE verifier and `S256` challenge per attempt;
- a fresh high-entropy `state` value per attempt;
- server-side state that binds the attempt to the authenticated Evaluchat user,
  intended return location, PKCE verifier, creation time, and expiry;
- an exact redirect URI allowlist and an HTTPS callback outside local
  development;
- atomic, one-time consumption of `state` before the authorization code is
  exchanged; and
- a short expiry, after which the attempt fails closed and must restart.

The callback rejects missing, mismatched, expired, already-consumed, or
wrong-user state. Neither authorization codes nor PKCE verifiers are written to
logs, analytics, browser storage, or error-reporting context. A callback
failure does not fall back to an unbound token exchange.

The stored post-callback destination is either a server-defined route ID or a
validated relative Evaluchat path. The OAuth redirect-URI allowlist constrains
where GitHub may return the authorization response; it does not constrain the
post-callback destination, which is validated independently.

## Consequences

- Capturing an authorization code alone is insufficient to complete the flow.
- Callback replay and login-CSRF attempts fail at one-time state consumption.
- Multiple tabs may start separate flows, but each callback is valid only for
  its own state record and verifier.
- Later auth work must provide an atomic, expiring state store; this ADR does
  not add OAuth runtime code.
