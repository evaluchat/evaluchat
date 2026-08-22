# ADR-0001: Separate private-workspace and public-catalogue GitHub Apps

- Status: Accepted
- Date: 2026-08-22
- Release: v0.8

## Context

Evaluchat must edit a researcher's selected private repository and, only after
an explicit publication confirmation, create a draft pull request in the public
`evaluchat/research` catalogue. One credential spanning both trust domains
would let a compromise on either path cross the private/public boundary.

## Decision

Use two independently configured GitHub Apps:

1. The user-facing **Evaluchat Research Workspace App** is installed only on
   repositories selected by the researcher. It requests:
   - Metadata: read
   - Contents: read and write
2. The operator-controlled **Evaluchat Catalogue Publisher App** is installed
   only on `evaluchat/research`. It requests:
   - Metadata: read
   - Contents: write
   - Pull requests: write

The workspace app never receives Pull requests, Administration, Workflows,
email, or broad account permissions. The publisher app never receives access
to a researcher's private repository. Installation access tokens are minted
just in time for the selected installation and are never persisted.

Repository creation is a GitHub-hosted hand-off from the Private Research
Starter template with private visibility preselected. Evaluchat does not ask
for Administration permission to create repositories.

Publication stops at a `draft: true` pull request. Evaluchat does not ready,
approve, or merge a public-catalogue pull request.

## Consequences

- A workspace credential cannot publish to the catalogue, and a publisher
  credential cannot read a private workspace.
- Operators must manage two app registrations, keys, installations, and
  revocation procedures.
- Later implementation must reject any installation or repository ID outside
  the app's expected trust domain before requesting an installation token.
