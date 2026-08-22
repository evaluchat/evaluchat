# ADR-0003: Encrypt and rotate GitHub user tokens in a versioned envelope

- Status: Accepted
- Date: 2026-08-22
- Release: v0.8

## Context

The workspace app needs an expiring GitHub user access token so commits are
attributable to the researcher and constrained by both user and installation
permissions. Access and refresh tokens are bearer credentials. They must remain
usable across requests without becoming plaintext application data or being
coupled permanently to one encryption key.

GitHub's current default lifetimes are eight hours for a user access token and
six months for its refresh token. GitHub rotates both values during refresh.

## Decision

Persist access and refresh tokens only inside a dedicated server-side
AES-256-GCM envelope. Each encrypted field records:

- an envelope version;
- a non-secret key identifier (`kid`);
- a unique 96-bit nonce;
- ciphertext; and
- the 128-bit authentication tag.

The 256-bit encryption key is supplied by the server's secret manager or
runtime environment and is never stored beside ciphertext. Authenticated
additional data binds the envelope to its credential record, token kind, app,
and envelope version so ciphertext cannot be swapped between records.

Refresh begins before access-token expiry, is serialized per credential, and
atomically replaces both encrypted tokens and their expiries with GitHub's
rotated values. Old values are not retained after a successful transaction.
Key rotation decrypts using the recorded `kid` and re-encrypts under the active
key. Installation access tokens are generated just in time and never stored.

Authentication-tag failure, an unknown `kid`, refresh rejection, a missing
rotated token, or an interrupted/ambiguous refresh fails closed. Evaluchat
marks the binding blocked and requires reconciliation or reauthorization; it
does not continue with guessed or partially updated credentials.

## Consequences

- Database disclosure does not reveal plaintext GitHub credentials without the
  separately managed encryption key.
- Operations must retain old decryption keys only for the bounded period needed
  to rewrap existing envelopes, then retire them.
- Later storage work must use compare-and-swap or equivalent serialization to
  prevent concurrent refreshes from overwriting the newest rotated token.
- Revocation and rotation failure behavior is expanded in the research threat
  model.
