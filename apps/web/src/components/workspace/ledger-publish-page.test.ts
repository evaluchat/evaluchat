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
    if (props["data-testid"] === "ledger-refresh-preview" && onClick) {
      reactState.openPreview = onClick;
    }
    return React.createElement(
      "button",
      { type: "button", ...props },
      children
    );
  },
}));

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

describe("LedgerPublishPage", () => {
  afterEach(() => {
    reactState.enabled = false;
    reactState.index = 0;
    reactState.slots = [];
    reactState.openPreview = undefined;
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
    // LedgerPublishPage state order: publication, preview, previewError,
    // publishError, isLoadingPreview, isPublishing, isRefreshing, authorised,
    // anonymised, publicData, rePublish, pullRequestActual.
    const SLOT = {
      preview: 1,
      isLoadingPreview: 4,
      authorised: 7,
      anonymised: 8,
      publicData: 9,
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
    renderToStaticMarkup(React.createElement(LedgerPublishPage, { item }));
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
});
