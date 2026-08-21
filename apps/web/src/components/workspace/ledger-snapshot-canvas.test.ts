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
