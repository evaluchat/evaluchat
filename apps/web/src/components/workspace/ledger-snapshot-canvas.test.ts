import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const reactState = vi.hoisted(() => ({
  enabled: false,
  index: 0,
  slots: [] as Array<{ value: unknown }>,
  openPreview: undefined as undefined | (() => void),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState(initial: unknown) {
      if (!reactState.enabled) return actual.useState(initial);
      const i = reactState.index++;
      if (!reactState.slots[i]) reactState.slots[i] = { value: initial };
      return [
        reactState.slots[i].value,
        (update: unknown) => {
          const slot = reactState.slots[i];
          slot.value =
            typeof update === "function"
              ? (update as (value: unknown) => unknown)(slot.value)
              : update;
        },
      ];
    },
  };
});

vi.mock("lucide-react", () => ({ ExternalLink: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    "data-testid"?: string;
  }) => {
    if (props["data-testid"] === "ledger-publish" && onClick) {
      reactState.openPreview = onClick;
    }
    return React.createElement(
      "button",
      { type: "button", ...props },
      children
    );
  },
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
  LedgerPublicationPanel,
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
  afterEach(() => {
    reactState.enabled = false;
    reactState.index = 0;
    reactState.slots = [];
    reactState.openPreview = undefined;
    vi.unstubAllGlobals();
  });

  it("labels unpublished, draft, and merged states without enabling snapshot edits", () => {
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
    expect(publicationStatusText(draft, { state: "open", merged: false })).toBe(
      "Draft PR — pending human merge"
    );
    expect(
      publicationStatusText(draft, { state: "closed", merged: false })
    ).toBe("Draft PR closed without merge");
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
    // After a successful republish, cached GitHub actual must be cleared so
    // the newly opened draft PR is not immediately re-enabled for republish.
    const nextDraft = { status: "draft" as const, pullRequestNumber: 86 };
    expect(canRepublishClosedPullRequest(nextDraft)).toBe(false);
    expect(canRepublishClosedPullRequest(nextDraft, undefined)).toBe(false);
  });

  it("replaces pending-merge copy when the draft PR is closed without merge", () => {
    const draftItem = {
      ...item,
      publication: { status: "draft" as const, pullRequestNumber: 85 },
    };
    const pendingMarkup = renderToStaticMarkup(
      React.createElement(LedgerPublicationPanel, { item: draftItem })
    );
    expect(pendingMarkup).toContain("Pending human merge");
    expect(pendingMarkup).not.toContain("Republish to create a new draft PR.");

    // LedgerPublicationPanel useState order: publication … pullRequestActual (12).
    reactState.enabled = true;
    reactState.slots[0] = { value: draftItem.publication };
    reactState.slots[12] = { value: { state: "closed", merged: false } };
    const closedMarkup = renderToStaticMarkup(
      React.createElement(LedgerPublicationPanel, { item: draftItem })
    );
    expect(closedMarkup).toContain(
      "Draft PR closed without merge. Republish to create a new draft PR."
    );
    expect(closedMarkup).not.toContain("Pending human merge");
  });

  it("reopening the publish dialog resets declarations and clears stale preview", async () => {
    // LedgerPublicationPanel useState order: publication, dialogOpen, preview,
    // previewError, publishError, isLoadingPreview, isPublishing, isRefreshing,
    // authorised, anonymised, publicData, rePublish, pullRequestActual.
    const SLOT = {
      preview: 2,
      isLoadingPreview: 5,
      authorised: 8,
      anonymised: 9,
      publicData: 10,
    } as const;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ markdown: "# stale preview" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: "Could not load the publication preview.",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    reactState.enabled = true;
    renderToStaticMarkup(React.createElement(LedgerPublicationPanel, { item }));
    expect(reactState.openPreview).toBeTypeOf("function");

    async function openAndSettle(callCount: number) {
      reactState.openPreview!();
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(callCount);
        expect(reactState.slots[SLOT.isLoadingPreview]?.value).toBe(false);
      });
    }

    await openAndSettle(1);
    expect(reactState.slots[SLOT.preview]?.value).toBe("# stale preview");
    reactState.slots[SLOT.authorised].value = true;
    reactState.slots[SLOT.anonymised].value = true;
    reactState.slots[SLOT.publicData].value = true;

    await openAndSettle(2);
    expect(reactState.slots[SLOT.authorised]?.value).toBe(false);
    expect(reactState.slots[SLOT.anonymised]?.value).toBe(false);
    expect(reactState.slots[SLOT.publicData]?.value).toBe(false);
    expect(reactState.slots[SLOT.preview]?.value).toBeUndefined();
  });
});
