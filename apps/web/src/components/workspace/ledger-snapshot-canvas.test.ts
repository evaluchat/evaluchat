import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  push: vi.fn(),
  graphData: {
    clearState: vi.fn(),
    setChatStarted: vi.fn(),
    setLedgerSnapshotContext: vi.fn(),
    isStreaming: false,
    messages: [],
    chatStarted: true,
    switchSelectedThread: vi.fn(),
    setMessages: vi.fn(),
    streamMessage: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: harness.push }),
}));
vi.mock("lucide-react", () => ({
  ExternalLink: () => null,
  PanelRightClose: () => null,
}));
vi.mock("@/contexts/GraphContext", () => ({
  useGraphContext: () => ({ graphData: harness.graphData }),
}));
vi.mock("@/contexts/ThreadProvider", () => ({
  useThreadContext: () => ({ setThreadId: vi.fn() }),
}));
vi.mock("@/contexts/AssistantContext", () => ({
  useAssistantContext: () => ({ selectedAssistant: undefined }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("@/components/NoSSRWrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/canvas/content-composer", () => ({
  ContentComposerChatInterface: () =>
    React.createElement("div", { "data-testid": "chat-composer" }),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) =>
    React.createElement("button", props, children),
}));
vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", undefined, children),
  ResizablePanel: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", undefined, children),
  ResizableHandle: () => React.createElement("div"),
}));
vi.mock("./workspace-item-banner", () => ({
  WorkspaceItemBanner: ({
    onSubmit,
    submitLabel,
    submitTestId,
    extraActions,
  }: {
    onSubmit?: () => void;
    submitLabel?: string;
    submitTestId?: string;
    extraActions?: React.ReactNode;
  }) =>
    React.createElement(
      "div",
      { "data-testid": "workspace-item-banner" },
      extraActions,
      onSubmit
        ? React.createElement(
            "button",
            { "data-testid": submitTestId },
            submitLabel
          )
        : null,
      React.createElement("a", { href: "/workspace" }, "Workspace")
    ),
}));
vi.mock("./workspace-item-delete-dialog", () => ({
  WorkspaceItemDeleteDialog: () => null,
}));

import {
  canRepublishClosedPullRequest,
  ledgerPublishRequestBody,
  publicationAccessError,
  publicationStatusText,
} from "@/lib/workspace/ledger-publication";
import {
  buildLedgerSnapshotAgentContext,
  LedgerSnapshotCanvas,
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
    methodTitle: "Demo method",
    methodVersion: "1.0.0",
    templateId: "evidence-template",
    templateVersion: "1.2.0",
    sourceCommit: "commit",
  },
};

describe("LedgerSnapshotCanvas", () => {
  it("uses the workspace banner for back navigation and publishing", () => {
    const markup = renderToStaticMarkup(
      React.createElement(LedgerSnapshotCanvas, { item })
    );

    expect(markup).toContain('data-testid="workspace-item-banner"');
    expect(markup).toContain('href="/workspace"');
    expect(markup).toContain('data-testid="ledger-publish"');
    expect(markup).not.toContain("ledger-snapshot-breadcrumb");
    expect(markup).not.toContain('data-testid="ledger-publication"');
    expect(markup).not.toContain("textarea");
    expect(markup).not.toContain("contenteditable");
  });

  it("moves published state and its pull request link into the banner", () => {
    const markup = renderToStaticMarkup(
      React.createElement(LedgerSnapshotCanvas, {
        item: {
          ...item,
          publication: {
            status: "draft",
            pullRequestUrl: "https://github.com/evaluchat/research/pull/85",
          },
        },
      })
    );

    expect(markup).toContain("Draft PR — pending human merge");
    expect(markup).toContain(
      'href="https://github.com/evaluchat/research/pull/85"'
    );
    expect(markup).not.toContain('data-testid="ledger-publish"');
  });

  it("derives a bounded snapshot summary without contribution rows", () => {
    const context = buildLedgerSnapshotAgentContext({
      ...item,
      snapshot: {
        ...item.snapshot,
        manifest: {
          contributions: [
            {
              path: "evidence/included.md",
              sourceHash: "secret-source-hash",
              bucket: "Included",
              dimensionValues: {
                education_level: { status: "recorded", value: "k12" },
              },
              scopeValues: {},
            },
            {
              path: "evidence/missing.md",
              sourceHash: "secret-gap-hash",
              bucket: "Unavailable",
              dimensionValues: {
                education_level: { status: "recorded", value: "higher_ed" },
              },
              scopeValues: {},
            },
          ],
        },
      },
    });

    expect(context).toMatchObject({
      kind: "ledger_snapshot",
      parentLedgerItemId: "wi_ledger",
      methodTitle: "Demo method",
      sourceCommit: "commit",
      generatedAt: "2026-08-19T12:00:00.000Z",
      contributions: {
        included: 1,
        perDimension: { education_level: { k12: 1 } },
        gaps: [{ path: "evidence/missing.md", bucket: "Unavailable" }],
      },
    });
    expect(context).not.toHaveProperty("manifest");
    expect(JSON.stringify(context)).not.toContain("secret-source-hash");
    expect(JSON.stringify(context)).not.toContain("secret-gap-hash");
  });

  it("truncates oversized snapshot strings and records the affected fields", () => {
    const context = buildLedgerSnapshotAgentContext({
      ...item,
      snapshot: {
        ...item.snapshot,
        predicate: "p".repeat(501),
      },
    });

    expect(context.predicate).toHaveLength(500);
    expect(context.predicate).toMatch(/…$/);
    expect(context.truncated).toMatchObject({ applied: true });
    expect(context.truncated?.fields).toContain("predicate");
  });

  it("keeps FNV-colliding truncated keys separate", () => {
    const commonPrefix = "x".repeat(120);
    // These tails produce the same stableKeySuffix with the common prefix.
    const dimensionA = `${commonPrefix}009pfs`;
    const dimensionB = `${commonPrefix}00avja`;
    const valueA = dimensionA;
    const valueB = dimensionB;
    const context = buildLedgerSnapshotAgentContext({
      ...item,
      snapshot: {
        ...item.snapshot,
        buckets: {
          ...item.snapshot.buckets,
          [dimensionA]: 1,
          [dimensionB]: 2,
        },
        manifest: {
          contributions: [
            {
              path: "evidence/a.md",
              sourceHash: "source-a",
              bucket: "Included",
              dimensionValues: {
                [dimensionA]: { status: "recorded", value: valueA },
                [dimensionB]: { status: "recorded", value: valueA },
              },
              scopeValues: {},
            },
            {
              path: "evidence/b.md",
              sourceHash: "source-b",
              bucket: "Included",
              dimensionValues: {
                [dimensionA]: { status: "recorded", value: valueB },
                [dimensionB]: { status: "recorded", value: valueB },
              },
              scopeValues: {},
            },
          ],
        },
      },
    });

    const dimensions = Object.entries(context.contributions.perDimension);
    expect(dimensions).toHaveLength(2);
    expect(new Set(dimensions.map(([dimensionId]) => dimensionId)).size).toBe(
      2
    );
    expect(dimensions.map(([dimensionId]) => dimensionId.length)).toEqual([
      80, 80,
    ]);
    expect(
      dimensions
        .map(([dimensionId]) => dimensionId)
        .filter((key) => key.endsWith("~2"))
    ).toHaveLength(1);
    for (const [, values] of dimensions) {
      expect(Object.keys(values)).toHaveLength(2);
      expect(new Set(Object.keys(values)).size).toBe(2);
      expect(Object.keys(values).map((value) => value.length)).toEqual([
        120, 120,
      ]);
      expect(Object.keys(values).some((key) => key.endsWith("~2"))).toBe(true);
      expect(Object.values(values)).toEqual([1, 1]);
    }
    expect(Object.keys(context.buckets)).toHaveLength(
      Object.keys(item.snapshot.buckets).length + 2
    );
    expect(new Set(Object.keys(context.buckets)).size).toBe(
      Object.keys(context.buckets).length
    );
    expect(Object.keys(context.buckets).some((key) => key.endsWith("~2"))).toBe(
      true
    );
    expect(Object.values(context.buckets)).toEqual(
      expect.arrayContaining([1, 2])
    );
  });

  it("drops the largest dimension summaries deterministically to fit the context budget", () => {
    const dimensionIds = Array.from(
      { length: 24 },
      (_, dimensionIndex) =>
        `dimension-${String(dimensionIndex).padStart(2, "0")}-${"d".repeat(60)}`
    );
    const snapshotItem = {
      ...item,
      snapshot: {
        ...item.snapshot,
        buckets: {
          [`bucket-${"b".repeat(100)}`]: 24,
        },
        manifest: {
          contributions: Array.from({ length: 24 }, (_, contributionIndex) => ({
            path: `evidence/included-${contributionIndex}.md`,
            sourceHash: `source-${contributionIndex}`,
            bucket: "Included" as const,
            dimensionValues: Object.fromEntries(
              dimensionIds.map((dimensionId) => [
                dimensionId,
                {
                  status: "recorded" as const,
                  value: `value-${String(contributionIndex).padStart(2, "0")}-${"v".repeat(110)}`,
                },
              ])
            ),
            scopeValues: {},
          })),
        },
      },
      publication: {
        status: "draft",
        pullRequestUrl: `https://example.test/${"p".repeat(400)}`,
      },
    };

    const context = buildLedgerSnapshotAgentContext(snapshotItem);
    const repeatedContext = buildLedgerSnapshotAgentContext(snapshotItem);

    expect(Object.keys(context.contributions.perDimension).length).toBeLessThan(
      24
    );
    expect(JSON.stringify(context, null, 2).length).toBeLessThanOrEqual(6000);
    expect(Object.keys(context.buckets)[0]).toHaveLength(80);
    expect(context.publication?.prUrl).toHaveLength(300);
    expect(context.truncated?.fields).toContain("contributions.perDimension");
    expect(context.truncated?.fields).toContain("buckets");
    expect(context.truncated?.fields).toContain("publication.prUrl");
    expect(context).toEqual(repeatedContext);
  });

  it("drops sorted bucket entries to fit the context budget", () => {
    const buckets = {
      ...item.snapshot.buckets,
      ...Object.fromEntries(
        Array.from({ length: 100 }, (_, index) => [
          `bucket-${String(index).padStart(3, "0")}-${"b".repeat(65)}`,
          index,
        ])
      ),
    };
    const snapshotItem = {
      ...item,
      snapshot: {
        ...item.snapshot,
        buckets,
      },
    };

    const context = buildLedgerSnapshotAgentContext(snapshotItem);
    const repeatedContext = buildLedgerSnapshotAgentContext(snapshotItem);
    const bucketKeys = Object.keys(context.buckets);
    const allBucketKeys = Object.keys(buckets).sort();

    expect(JSON.stringify(context, null, 2).length).toBeLessThanOrEqual(6000);
    expect(bucketKeys.length).toBeLessThan(allBucketKeys.length);
    expect(bucketKeys).toEqual(allBucketKeys.slice(0, bucketKeys.length));
    expect(context.truncated?.fields).toContain("buckets");
    expect(context).toEqual(repeatedContext);
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
