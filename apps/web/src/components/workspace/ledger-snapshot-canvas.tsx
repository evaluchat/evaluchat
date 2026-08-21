"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, PanelRightClose } from "lucide-react";
import { HumanMessage } from "@langchain/core/messages";
import type { LedgerSnapshotAgentContext } from "@opencanvas/shared";
import { OC_HIDE_FROM_UI_KEY } from "@opencanvas/shared/constants";
import { ContentComposerChatInterface } from "@/components/canvas/content-composer";
import NoSSRWrapper from "@/components/NoSSRWrapper";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useAssistantContext } from "@/contexts/AssistantContext";
import { useGraphContext } from "@/contexts/GraphContext";
import { useThreadContext } from "@/contexts/ThreadProvider";
import type { EvidenceLedgerManifest } from "@/lib/apparatuses/evidence-ledger";
import { convertToOpenAIFormat } from "@/lib/convert_messages";
import { workspaceItemTitle } from "@/lib/workspace/display";
import { publicationStatusText } from "@/lib/workspace/ledger-publication";
import type { LedgerSnapshotWorkspaceItem } from "@/lib/workspace/types";
import { useToast } from "@/hooks/use-toast";
import { WorkspaceItemBanner } from "./workspace-item-banner";
import { WorkspaceItemDeleteDialog } from "./workspace-item-delete-dialog";

const VIEWS = [
  "Scope",
  "Evidence",
  "Descriptive views",
  "Comparability",
  "Counterevidence and gaps",
] as const;
type View = (typeof VIEWS)[number];

const MAX_SNAPSHOT_DIMENSIONS = 24;
const MAX_SNAPSHOT_VALUES_PER_DIMENSION = 24;
const MAX_SNAPSHOT_GAP_PATHS = 50;

function manifestFor(
  item: LedgerSnapshotWorkspaceItem
): EvidenceLedgerManifest | undefined {
  const manifest = item.snapshot.manifest;
  return manifest && typeof manifest === "object"
    ? (manifest as EvidenceLedgerManifest)
    : undefined;
}

function perDimension(
  manifest: EvidenceLedgerManifest | undefined
): LedgerSnapshotAgentContext["contributions"]["perDimension"] {
  const distributions = new Map<string, Map<string, number>>();

  for (const contribution of manifest?.contributions ?? []) {
    if (contribution.bucket !== "Included") continue;
    for (const [dimensionId, value] of Object.entries(
      contribution.dimensionValues
    )) {
      const values =
        distributions.get(dimensionId) ?? new Map<string, number>();
      const label =
        value.status === "unknown" ? "unknown" : String(value.value);
      values.set(label, (values.get(label) ?? 0) + 1);
      distributions.set(dimensionId, values);
    }
  }

  return Object.fromEntries(
    [...distributions.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, MAX_SNAPSHOT_DIMENSIONS)
      .map(([dimensionId, values]) => [
        dimensionId,
        Object.fromEntries(
          [...values.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .slice(0, MAX_SNAPSHOT_VALUES_PER_DIMENSION)
        ),
      ])
  );
}

/**
 * Derive a bounded conversational summary from a sealed snapshot. In
 * particular, never expose contribution rows or the source manifest to the
 * assistant; individual paths are retained only for recorded gaps.
 */
export function buildLedgerSnapshotAgentContext(
  item: LedgerSnapshotWorkspaceItem
): LedgerSnapshotAgentContext {
  const manifest = manifestFor(item);
  const contributions = manifest?.contributions ?? [];

  return {
    kind: "ledger_snapshot",
    ledgerId: item.snapshot.ledgerId,
    parentLedgerItemId: item.parentLedgerItemId,
    methodId: item.snapshot.methodId,
    ...(item.source.methodTitle !== undefined
      ? { methodTitle: item.source.methodTitle }
      : {}),
    methodVersion: item.snapshot.methodVersion,
    templateId: item.snapshot.templateId,
    templateVersion: item.snapshot.templateVersion,
    predicate: item.snapshot.predicate,
    sourceCommit: item.snapshot.sourceCommit,
    generatedAt: item.snapshot.generatedAt,
    buckets: item.snapshot.buckets,
    contributions: {
      included: contributions.length,
      perDimension: perDimension(manifest),
      gaps: contributions
        .filter((contribution) => contribution.bucket !== "Included")
        .map((contribution) => ({
          path: contribution.path,
          bucket: contribution.bucket,
        }))
        .sort((left, right) => left.path.localeCompare(right.path))
        .slice(0, MAX_SNAPSHOT_GAP_PATHS),
    },
    ...(item.publication
      ? {
          publication: {
            status: item.publication.status,
            ...(item.publication.pullRequestUrl
              ? { prUrl: item.publication.pullRequestUrl }
              : {}),
          },
        }
      : {}),
  };
}

export function LedgerSnapshotCanvas({
  item,
}: {
  item: LedgerSnapshotWorkspaceItem;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { graphData } = useGraphContext();
  const { setThreadId } = useThreadContext();
  const { selectedAssistant } = useAssistantContext();
  const [view, setView] = useState<View>("Scope");
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const bootstrappedItem = useRef<string | null>(null);
  const kickedOffItem = useRef<string | null>(null);
  const manifest = manifestFor(item);
  const contributions = manifest?.contributions || [];
  const gaps = contributions.filter(
    (contribution) => contribution.bucket !== "Included"
  );
  const snapshotContext = useMemo(
    () => buildLedgerSnapshotAgentContext(item),
    [item]
  );

  useEffect(() => {
    if (bootstrappedItem.current === item.id) return;
    bootstrappedItem.current = item.id;
    graphData.clearState();
    void setThreadId(null);
    graphData.setChatStarted(true);
    // Snapshot context is rebuilt from this sealed item rather than persisted
    // in the conversation thread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  useEffect(() => {
    graphData.setLedgerSnapshotContext(snapshotContext);
    return () => graphData.setLedgerSnapshotContext(undefined);
  }, [graphData.setLedgerSnapshotContext, snapshotContext]);

  const getStreamInput = useCallback(
    () => ({
      ledgerSnapshotContext: snapshotContext,
      next: "replyToGeneralInput",
    }),
    [snapshotContext]
  );

  useEffect(() => {
    if (
      kickedOffItem.current === item.id ||
      !selectedAssistant ||
      graphData.isStreaming ||
      graphData.messages.length > 0
    ) {
      return;
    }

    kickedOffItem.current = item.id;
    const kickoff = new HumanMessage({
      id: `ledger-snapshot-kickoff-${item.id}`,
      content:
        "Open this Evidence Ledger snapshot, understand the sealed record (predicate, buckets, contributions, gaps, publication state) and welcome the user. Answer questions about the snapshot; it is immutable.",
      additional_kwargs: { [OC_HIDE_FROM_UI_KEY]: true },
    });
    graphData.setMessages([kickoff]);
    void graphData
      .streamMessage({
        ...getStreamInput(),
        messages: [convertToOpenAIFormat(kickoff)],
      })
      .catch((error) => {
        kickedOffItem.current = null;
        graphData.setMessages((messages) =>
          messages.filter((message) => message.id !== kickoff.id)
        );
        console.error("Ledger snapshot workspace kickoff failed", error);
        toast({
          title: "Could not open snapshot chat",
          description: "Please try again.",
          variant: "destructive",
        });
      });
  }, [getStreamInput, graphData, item.id, selectedAssistant, toast]);

  async function abandonItem() {
    setIsAbandoning(true);
    try {
      const response = await fetch(
        `/api/workspace/items/${encodeURIComponent(item.id)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!response.ok) throw new Error("Could not abandon workspace item");
      router.push("/workspace");
    } catch (error) {
      toast({
        title: "Could not abandon item",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAbandoning(false);
    }
  }

  return (
    <div
      className="flex h-screen min-h-0 flex-col bg-white"
      data-testid="ledger-snapshot-canvas"
    >
      <WorkspaceItemBanner
        item={item}
        onAbandon={() => setAbandonOpen(true)}
        {...(!item.publication
          ? {
              onSubmit: () =>
                router.push(
                  `/workspace/items/${encodeURIComponent(item.id)}?publish=1`
                ),
              submitLabel: "Publish",
              submitTestId: "ledger-publish",
            }
          : {
              extraActions: (
                <>
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white">
                    {publicationStatusText(item.publication)}
                  </span>
                  {item.publication.pullRequestUrl && (
                    <a
                      href={item.publication.pullRequestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-white underline underline-offset-2"
                    >
                      Draft PR <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </>
              ),
            })}
      />
      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
        {!chatCollapsed && (
          <ResizablePanel
            defaultSize={25}
            minSize={15}
            maxSize={50}
            className="min-h-0 bg-gray-50/70 shadow-inner-right"
            id="ledger-snapshot-chat-panel"
            order={1}
          >
            <NoSSRWrapper>
              <ContentComposerChatInterface
                minimalCanvas
                chatCollapsed={chatCollapsed}
                setChatCollapsed={setChatCollapsed}
                setChatStarted={graphData.setChatStarted}
                hasChatStarted={graphData.chatStarted}
                switchSelectedThreadCallback={graphData.switchSelectedThread}
                handleQuickStart={() => undefined}
                getStreamInput={getStreamInput}
              />
            </NoSSRWrapper>
          </ResizablePanel>
        )}
        {!chatCollapsed && <ResizableHandle />}
        <ResizablePanel
          defaultSize={chatCollapsed ? 100 : 75}
          minSize={chatCollapsed ? 100 : 50}
          maxSize={chatCollapsed ? 100 : 85}
          className="min-w-0 bg-white"
          id="ledger-snapshot-details-panel"
          order={2}
        >
          <div className="flex h-full min-h-0 flex-col bg-white">
            <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-4 py-1.5">
              {chatCollapsed && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setChatCollapsed(false)}
                  aria-label="Expand chat"
                >
                  <PanelRightClose className="h-4 w-4 text-gray-600" />
                </Button>
              )}
              <span className="truncate text-sm font-medium text-gray-700">
                {workspaceItemTitle(item)}
              </span>
            </div>
            <main className="min-h-0 flex-1 overflow-y-auto bg-white">
              <div className="mx-auto max-w-4xl space-y-5 px-5 py-8 sm:px-10">
                <header className="rounded-lg border bg-card p-5">
                  <h1 className="text-lg font-semibold">Ledger Snapshot</h1>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Ledger ID</dt>
                      <dd>{item.snapshot.ledgerId}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Method / template
                      </dt>
                      <dd>
                        {item.snapshot.methodId}@{item.snapshot.methodVersion} ·{" "}
                        {item.snapshot.templateId}@
                        {item.snapshot.templateVersion}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Predicate</dt>
                      <dd className="font-mono text-xs">
                        {item.snapshot.predicate}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Source commit</dt>
                      <dd className="break-all font-mono text-xs">
                        {item.snapshot.sourceCommit}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Resolver / render
                      </dt>
                      <dd>
                        {item.snapshot.resolverVersion} ·{" "}
                        {item.snapshot.renderHash}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Input fingerprint
                      </dt>
                      <dd className="break-all font-mono text-xs">
                        {item.snapshot.inputFingerprint}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Generated</dt>
                      <dd>{item.snapshot.generatedAt}</dd>
                    </div>
                  </dl>
                  <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {(
                      Object.entries(item.snapshot.buckets) as Array<
                        [string, number]
                      >
                    ).map(([bucket, count]) => (
                      <li key={bucket}>
                        {bucket}: {count}
                      </li>
                    ))}
                  </ul>
                </header>
                <nav
                  aria-label="Ledger snapshot views"
                  className="flex flex-wrap gap-2"
                >
                  {VIEWS.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setView(name)}
                      className={`rounded-md border px-3 py-1.5 text-sm ${view === name ? "bg-primary text-primary-foreground" : "bg-background"}`}
                    >
                      {name}
                      {name === "Counterevidence and gaps" &&
                      gaps.length > 0 ? (
                        <span
                          aria-label="non-empty counterevidence"
                          className="ml-2 rounded-full bg-amber-100 px-1.5 text-xs text-amber-800"
                        >
                          {gaps.length}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </nav>
                <section className="rounded-lg border bg-card p-5">
                  {view === "Scope" && (
                    <>
                      <h2 className="font-semibold">Scope</h2>
                      <p className="mt-2 text-sm">
                        Baseline accepted evidence:{" "}
                        {
                          contributions.filter(
                            (contribution) =>
                              contribution.bucket !== "Resolver exclusion"
                          ).length
                        }
                      </p>
                      <p className="mt-2 font-mono text-xs">
                        {item.snapshot.predicate}
                      </p>
                    </>
                  )}
                  {view === "Evidence" && (
                    <SnapshotEvidence
                      contributions={contributions.filter(
                        (contribution) => contribution.bucket === "Included"
                      )}
                      sourceCommit={item.snapshot.sourceCommit}
                    />
                  )}
                  {view === "Descriptive views" && (
                    <DescriptiveView
                      contributions={contributions.filter(
                        (contribution) => contribution.bucket === "Included"
                      )}
                    />
                  )}
                  {view === "Comparability" && (
                    <>
                      <h2 className="font-semibold">Comparability</h2>
                      <p className="mt-2 text-sm">
                        Method {item.snapshot.methodId}@
                        {item.snapshot.methodVersion} and template{" "}
                        {item.snapshot.templateId}@
                        {item.snapshot.templateVersion} are the fixed comparison
                        boundary.
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Only declared context values are retained; unavailable
                        and unknown values limit comparisons.
                      </p>
                    </>
                  )}
                  {view === "Counterevidence and gaps" && (
                    <>
                      <h2 className="font-semibold">
                        Counterevidence and gaps
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        This sealed record lists scope exclusions and
                        missingness; it does not reach a conclusion.
                      </p>
                      <SnapshotEvidence
                        contributions={gaps}
                        sourceCommit={item.snapshot.sourceCommit}
                      />
                    </>
                  )}
                </section>
              </div>
            </main>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      <WorkspaceItemDeleteDialog
        open={abandonOpen}
        onOpenChange={setAbandonOpen}
        onConfirm={() => void abandonItem()}
        itemTitle={workspaceItemTitle(item)}
        isDeleting={isAbandoning}
        confirmLabel="Abandon"
      />
    </div>
  );
}

function SnapshotEvidence({
  contributions,
  sourceCommit,
}: {
  contributions: EvidenceLedgerManifest["contributions"];
  /** Pin links to the snapshot's source commit so later research-main changes
   * cannot show different content than the sealed snapshot recorded. */
  sourceCommit: string;
}) {
  return (
    <>
      <h2 className="font-semibold">Evidence</h2>
      {contributions.length ? (
        <ul className="mt-3 space-y-2">
          {contributions.map((contribution) => (
            <li key={contribution.path} className="rounded border p-3 text-sm">
              <a
                className="font-medium underline"
                href={`https://github.com/evaluchat/research/blob/${sourceCommit}/${contribution.path}`}
                target="_blank"
                rel="noreferrer"
              >
                {contribution.id || contribution.path}
              </a>
              <p className="mt-1 text-xs text-muted-foreground">
                {contribution.sourceHash} · {contribution.methodId}@
                {contribution.methodVersion}
              </p>
              <p className="mt-1 text-xs">
                {Object.entries(contribution.dimensionValues)
                  .map(
                    ([key, value]) =>
                      `${key}: ${value.status === "unknown" ? "unknown" : value.value}`
                  )
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          No source records in this view.
        </p>
      )}
    </>
  );
}

function DescriptiveView({
  contributions,
}: {
  contributions: EvidenceLedgerManifest["contributions"];
}) {
  const counts = new Map<string, number>();
  for (const contribution of contributions)
    for (const [field, value] of Object.entries(contribution.dimensionValues)) {
      const key = `${field}: ${value.status === "unknown" ? "unknown" : value.value}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  return (
    <>
      <h2 className="font-semibold">Descriptive views</h2>
      <ul className="mt-3 space-y-1 text-sm">
        {[...counts.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([label, count]) => (
            <li key={label}>
              {label}: {count}
            </li>
          ))}
      </ul>
      {!counts.size && (
        <p className="mt-2 text-sm text-muted-foreground">
          Insufficient information for a distribution.
        </p>
      )}
    </>
  );
}
