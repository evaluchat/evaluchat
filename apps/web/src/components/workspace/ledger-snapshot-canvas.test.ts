import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("lucide-react", () => ({ ExternalLink: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) =>
    React.createElement("button", { type: "button" }, children),
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: () => null,
  DialogContent: () => null,
  DialogDescription: () => null,
  DialogFooter: () => null,
  DialogHeader: () => null,
  DialogTitle: () => null,
}));

import {
  LedgerSnapshotCanvas,
  canRepublishClosedPullRequest,
  ledgerPublishRequestBody,
  publicationAccessError,
  publicationStatusText,
} from "./ledger-snapshot-canvas";

const item = {
  id: "wi_snapshot",
  ownerId: "user-1",
  status: "active" as const,
  createdAt: "2026-08-19T12:00:00.000Z",
  updatedAt: "2026-08-19T12:00:00.000Z",
  kind: "ledger_snapshot" as const,
  snapshot: {
    ledgerId: "ledger_demo",
    methodId: "demo-method",
    methodVersion: "1.0.0",
    templateId: "evidence-template",
    templateVersion: "1.2.0",
    filters: [],
    manifest: { contributions: [] },
    inputFingerprint: "sha256:input",
    renderHash: "sha256:render",
    buckets: {
      Included: 0,
      "Outside declared scope": 0,
      Unknown: 0,
      Unavailable: 0,
      "Resolver exclusion": 0,
    },
    predicate: "all accepted evidence",
    generatedAt: "2026-08-19T12:00:00.000Z",
    resolverVersion: "1.0.0",
    sourceCommit: "commit",
  },
  config: {
    methodId: "demo-method",
    methodVersion: "1.0.0",
    templateId: "evidence-template",
    templateVersion: "1.2.0",
    filters: [],
  },
  parentLedgerItemId: "wi_ledger",
  source: {
    methodId: "demo-method",
    methodVersion: "1.0.0",
    templateId: "evidence-template",
    templateVersion: "1.2.0",
    sourceCommit: "commit",
  },
};

describe("LedgerSnapshotCanvas publication controls", () => {
  it("labels unpublished, draft, and merged states without enabling snapshot edits", () => {
    expect(publicationStatusText()).toBe("Unpublished");
    expect(
      publicationStatusText({ status: "draft", pullRequestNumber: 85 })
    ).toBe("Draft PR — pending human merge");
    expect(publicationStatusText({ status: "merged", mergedAt: "now" })).toBe(
      "Merged"
    );

    const markup = renderToStaticMarkup(
      React.createElement(LedgerSnapshotCanvas, { item })
    );
    expect(markup).toContain("Publish");
    expect(markup).not.toContain("textarea");
    expect(markup).not.toContain("contenteditable");
  });

  it("explains a GitHub write-access denial", () => {
    expect(publicationAccessError("missing_write_access")).toContain(
      "No branch or pull request was created"
    );
  });

  it("sends the public data declaration with the other consent fields", () => {
    expect(
      ledgerPublishRequestBody({
        authorised: true,
        anonymised: true,
        publicData: true,
      }).values
    ).toEqual({
      publication_authorisation: "confirmed-authorised-to-publish",
      anonymisation_status:
        "confirmed-no-student-identifiers-or-raw-student-material",
      public_data_declaration: "confirmed-public-data",
    });
    expect(
      ledgerPublishRequestBody({
        authorised: false,
        anonymised: false,
        publicData: false,
        rePublish: true,
      })
    ).toEqual({
      rePublish: true,
      values: {
        publication_authorisation: "not-confirmed-do-not-submit",
        anonymisation_status: "needs-human-privacy-review",
        public_data_declaration: "not-confirmed-do-not-submit",
      },
    });
  });

  it("offers republish for a closed unmerged draft while keeping refresh copy", () => {
    const draft = { status: "draft" as const, pullRequestNumber: 85 };
    expect(publicationStatusText(draft)).toBe("Draft PR — pending human merge");
    expect(canRepublishClosedPullRequest(draft)).toBe(false);
    expect(
      canRepublishClosedPullRequest(draft, { state: "open", merged: false })
    ).toBe(false);
    expect(
      canRepublishClosedPullRequest(draft, { state: "closed", merged: false })
    ).toBe(true);
    expect(
      canRepublishClosedPullRequest(draft, { state: "closed", merged: true })
    ).toBe(false);
  });
});
