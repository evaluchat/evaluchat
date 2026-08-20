import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) =>
    React.createElement("a", { href, ...props }, children),
}));
vi.mock("lucide-react", () => ({ ChevronRight: () => null }));

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
  it("shows breadcrumbs and links the compact publication status to the page", () => {
    const markup = renderToStaticMarkup(
      React.createElement(LedgerSnapshotCanvas, { item })
    );

    expect(markup).toContain('data-testid="ledger-snapshot-breadcrumb"');
    expect(markup).toContain('href="/workspace/items/wi_ledger"');
    expect(markup).toContain('href="/workspace/items/wi_snapshot?publish=1"');
    expect(markup).toContain("Unpublished");
    expect(markup).not.toContain("textarea");
    expect(markup).not.toContain("contenteditable");
  });

  it("labels unpublished, draft, and merged states", () => {
    const draft = { status: "draft" as const, pullRequestNumber: 85 };
    expect(publicationStatusText()).toBe("Unpublished");
    expect(publicationStatusText(draft)).toBe("Draft PR — pending human merge");
    expect(publicationStatusText(draft, { state: "open", merged: false })).toBe(
      "Draft PR — pending human merge"
    );
    expect(
      publicationStatusText(draft, { state: "closed", merged: false })
    ).toBe("Draft PR closed without merge");
    expect(publicationStatusText({ status: "merged", mergedAt: "now" })).toBe(
      "Merged"
    );
  });

  it("keeps the existing consent request body and access error", () => {
    expect(publicationAccessError("missing_write_access")).toContain(
      "No branch or pull request was created"
    );
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

  it("only allows republishing a closed, unmerged draft PR", () => {
    const draft = { status: "draft" as const, pullRequestNumber: 85 };
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
