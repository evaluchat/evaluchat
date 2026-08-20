import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const reactState = vi.hoisted(() => ({
  enabled: false,
  index: 0,
  slots: [] as Array<{ value: unknown }>,
  openPreview: undefined as undefined | (() => void),
  actions: {} as Record<string, () => void>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState(initial: unknown) {
      if (!reactState.enabled) return actual.useState(initial);
      const index = reactState.index++;
      if (!reactState.slots[index])
        reactState.slots[index] = { value: initial };
      return [
        reactState.slots[index].value,
        (update: unknown) => {
          const slot = reactState.slots[index];
          slot.value =
            typeof update === "function"
              ? (update as (value: unknown) => unknown)(slot.value)
              : update;
        },
      ];
    },
  };
});

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) =>
    React.createElement("a", { href, ...props }, children),
}));
vi.mock("lucide-react", () => ({
  ChevronRight: () => null,
  ExternalLink: () => null,
}));
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
    if (props["data-testid"] && onClick) {
      reactState.actions[props["data-testid"]] = onClick;
      if (props["data-testid"] === "ledger-refresh-preview") {
        reactState.openPreview = onClick;
      }
    }
    return React.createElement(
      "button",
      { type: "button", ...props },
      children
    );
  },
}));

import { ledgerPublishRequestBody } from "@/lib/workspace/ledger-publication";
import { LedgerPublishPage } from "./ledger-publish-page";

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

const SLOT = {
  publication: 0,
  preview: 1,
  previewError: 2,
  publishError: 3,
  isLoadingPreview: 4,
  isPublishing: 5,
  isRefreshing: 6,
  authorised: 7,
  anonymised: 8,
  publicData: 9,
  rePublish: 10,
  pullRequestActual: 11,
} as const;

function assertPublishPageStateSlots(initialPublication: unknown) {
  const expectedInitialValues = [
    initialPublication,
    undefined,
    undefined,
    undefined,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    undefined,
  ];
  const actualInitialValues = reactState.slots.map((slot) => slot.value);
  if (
    actualInitialValues.length !== expectedInitialValues.length ||
    !actualInitialValues.every((value, index) =>
      Object.is(value, expectedInitialValues[index])
    )
  ) {
    throw new Error(
      `LedgerPublishPage useState slots changed; expected ${JSON.stringify(expectedInitialValues)}, received ${JSON.stringify(actualInitialValues)}. Update SLOT and these tests.`
    );
  }
}

describe("LedgerPublishPage", () => {
  afterEach(() => {
    reactState.enabled = false;
    reactState.index = 0;
    reactState.slots = [];
    reactState.openPreview = undefined;
    reactState.actions = {};
    vi.unstubAllGlobals();
  });

  it("renders breadcrumb navigation and a responsive, non-dialog publication layout", () => {
    const markup = renderToStaticMarkup(
      React.createElement(LedgerPublishPage, { item })
    );

    expect(markup).toContain('data-testid="ledger-publish-page"');
    expect(markup).toContain('data-testid="ledger-publish-breadcrumb"');
    expect(markup).toContain('href="/workspace/items/wi_ledger"');
    expect(markup).toContain('href="/workspace/items/wi_snapshot"');
    expect(markup).toContain("lg:grid-cols-");
    expect(markup).toContain("min-w-0");
    expect(markup).toContain('data-testid="ledger-confirm-publish"');
    expect(markup).toContain("ledger-publication-authorisation");
    expect(markup).toContain("ledger-anonymisation-status");
    expect(markup).toContain("ledger-public-data-declaration");
    expect(markup).not.toContain("dialog");
  });

  it("refreshes the preview and clears stale consent declarations", async () => {
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
    renderToStaticMarkup(React.createElement(LedgerPublishPage, { item }));
    assertPublishPageStateSlots(item.publication);
    expect(reactState.openPreview).toBeTypeOf("function");

    async function refreshAndSettle(callCount: number) {
      reactState.openPreview!();
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(callCount);
        expect(reactState.slots[SLOT.isLoadingPreview]?.value).toBe(false);
      });
    }

    await refreshAndSettle(1);
    expect(reactState.slots[SLOT.preview]?.value).toBe("# stale preview");
    reactState.slots[SLOT.authorised].value = true;
    reactState.slots[SLOT.anonymised].value = true;
    reactState.slots[SLOT.publicData].value = true;

    await refreshAndSettle(2);
    expect(reactState.slots[SLOT.authorised]?.value).toBe(false);
    expect(reactState.slots[SLOT.anonymised]?.value).toBe(false);
    expect(reactState.slots[SLOT.publicData]?.value).toBe(false);
    expect(reactState.slots[SLOT.preview]?.value).toBeUndefined();
  });

  it("sends the public-safety declarations in the publish request", async () => {
    const publication = {
      status: "draft" as const,
      pullRequestNumber: 86,
      pullRequestUrl: "https://github.com/evaluchat/research/pull/86",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ publication }),
    });
    vi.stubGlobal("fetch", fetchMock);

    reactState.enabled = true;
    reactState.slots[SLOT.preview] = { value: "# preview" };
    reactState.slots[SLOT.authorised] = { value: true };
    reactState.slots[SLOT.anonymised] = { value: true };
    reactState.slots[SLOT.publicData] = { value: true };
    renderToStaticMarkup(React.createElement(LedgerPublishPage, { item }));

    reactState.actions["ledger-confirm-publish"]!();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(reactState.slots[SLOT.isPublishing]?.value).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspace/items/wi_snapshot/ledger/publish",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          ledgerPublishRequestBody({
            authorised: true,
            anonymised: true,
            publicData: true,
          })
        ),
      })
    );
    expect(reactState.slots[SLOT.publication]?.value).toEqual(publication);
    expect(reactState.slots[SLOT.pullRequestActual]?.value).toBeUndefined();
  });

  it("refreshes the recorded pull request status", async () => {
    const draftItem = {
      ...item,
      publication: { status: "draft" as const, pullRequestNumber: 85 },
    };
    const publication = { status: "merged" as const, mergedAt: "now" };
    const actual = { state: "closed", merged: true };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ publication, actual }),
    });
    vi.stubGlobal("fetch", fetchMock);

    reactState.enabled = true;
    renderToStaticMarkup(
      React.createElement(LedgerPublishPage, { item: draftItem })
    );
    assertPublishPageStateSlots(draftItem.publication);

    reactState.actions["ledger-refresh-publication"]!();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(reactState.slots[SLOT.isRefreshing]?.value).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspace/items/wi_snapshot/ledger/publish/status",
      { method: "POST", credentials: "include" }
    );
    expect(reactState.slots[SLOT.publication]?.value).toEqual(publication);
    expect(reactState.slots[SLOT.pullRequestActual]?.value).toEqual(actual);
  });

  it("surfaces publish failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ reason: "missing_write_access" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    reactState.enabled = true;
    renderToStaticMarkup(React.createElement(LedgerPublishPage, { item }));

    reactState.actions["ledger-confirm-publish"]!();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(reactState.slots[SLOT.isPublishing]?.value).toBe(false);
    });

    expect(reactState.slots[SLOT.publishError]?.value).toContain(
      "No branch or pull request was created"
    );
  });

  it("shows republish messaging for a closed, unmerged draft PR", () => {
    const draftItem = {
      ...item,
      publication: { status: "draft" as const, pullRequestNumber: 85 },
    };
    reactState.enabled = true;
    reactState.slots[SLOT.publication] = { value: draftItem.publication };
    reactState.slots[SLOT.pullRequestActual] = {
      value: { state: "closed", merged: false },
    };

    const markup = renderToStaticMarkup(
      React.createElement(LedgerPublishPage, { item: draftItem })
    );

    expect(markup).toContain(
      "Draft PR closed without merge. Republish to create a new draft PR."
    );
    expect(markup).toContain('data-testid="ledger-republish"');
    expect(markup).not.toContain("Pending human merge.");
  });
});
