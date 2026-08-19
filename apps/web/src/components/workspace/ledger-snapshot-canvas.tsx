"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { EvidenceLedgerManifest } from "@/lib/apparatuses/evidence-ledger";
import type { LedgerSnapshotWorkspaceItem } from "@/lib/workspace/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const VIEWS = [
  "Scope",
  "Evidence",
  "Descriptive views",
  "Comparability",
  "Counterevidence and gaps",
] as const;
type View = (typeof VIEWS)[number];

function manifestFor(
  item: LedgerSnapshotWorkspaceItem
): EvidenceLedgerManifest | undefined {
  const manifest = item.snapshot.manifest;
  return manifest && typeof manifest === "object"
    ? (manifest as EvidenceLedgerManifest)
    : undefined;
}

export function LedgerSnapshotCanvas({
  item,
}: {
  item: LedgerSnapshotWorkspaceItem;
}) {
  const [view, setView] = useState<View>("Scope");
  const manifest = manifestFor(item);
  const contributions = manifest?.contributions || [];
  const gaps = contributions.filter(
    (contribution) => contribution.bucket !== "Included"
  );
  return (
    <main
      className="mx-auto max-w-5xl space-y-5 p-6"
      data-testid="ledger-snapshot-canvas"
    >
      <header className="rounded-lg border bg-card p-5">
        <h1 className="text-lg font-semibold">Ledger Snapshot</h1>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Ledger ID</dt>
            <dd>{item.snapshot.ledgerId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Method / template</dt>
            <dd>
              {item.snapshot.methodId}@{item.snapshot.methodVersion} ·{" "}
              {item.snapshot.templateId}@{item.snapshot.templateVersion}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Predicate</dt>
            <dd className="font-mono text-xs">{item.snapshot.predicate}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Source commit</dt>
            <dd className="break-all font-mono text-xs">
              {item.snapshot.sourceCommit}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Resolver / render</dt>
            <dd>
              {item.snapshot.resolverVersion} · {item.snapshot.renderHash}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Input fingerprint</dt>
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
            Object.entries(item.snapshot.buckets) as Array<[string, number]>
          ).map(([bucket, count]) => (
            <li key={bucket}>
              {bucket}: {count}
            </li>
          ))}
        </ul>
      </header>
      <LedgerPublicationPanel item={item} />
      <nav aria-label="Ledger snapshot views" className="flex flex-wrap gap-2">
        {VIEWS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setView(name)}
            className={`rounded-md border px-3 py-1.5 text-sm ${view === name ? "bg-primary text-primary-foreground" : "bg-background"}`}
          >
            {name}
            {name === "Counterevidence and gaps" && gaps.length > 0 ? (
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
                  (contribution) => contribution.bucket !== "Resolver exclusion"
                ).length
              }
            </p>
            <p className="mt-2 font-mono text-xs">{item.snapshot.predicate}</p>
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
              Method {item.snapshot.methodId}@{item.snapshot.methodVersion} and
              template {item.snapshot.templateId}@
              {item.snapshot.templateVersion} are the fixed comparison boundary.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Only declared context values are retained; unavailable and unknown
              values limit comparisons.
            </p>
          </>
        )}
        {view === "Counterevidence and gaps" && (
          <>
            <h2 className="font-semibold">Counterevidence and gaps</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This sealed record lists scope exclusions and missingness; it does
              not reach a conclusion.
            </p>
            <SnapshotEvidence
              contributions={gaps}
              sourceCommit={item.snapshot.sourceCommit}
            />
          </>
        )}
      </section>
    </main>
  );
}

type Publication = NonNullable<LedgerSnapshotWorkspaceItem["publication"]>;

export function publicationStatusText(
  publication?: Publication,
  actual?: { state?: string; merged?: boolean }
): string {
  if (!publication) return "Unpublished";
  return publication.status === "merged"
    ? "Merged"
    : actual?.state === "closed" && actual.merged !== true
      ? "Draft PR closed without merge"
      : "Draft PR — pending human merge";
}

export function canRepublishClosedPullRequest(
  publication?: Publication,
  actual?: { state?: string; merged?: boolean }
): boolean {
  return (
    publication?.status === "draft" &&
    actual?.state === "closed" &&
    actual.merged !== true
  );
}

export function ledgerPublishRequestBody(input: {
  authorised: boolean;
  anonymised: boolean;
  publicData: boolean;
  rePublish?: boolean;
}): {
  rePublish?: boolean;
  values: {
    publication_authorisation: string;
    anonymisation_status: string;
    public_data_declaration: string;
  };
} {
  return {
    ...(input.rePublish ? { rePublish: true } : {}),
    values: {
      publication_authorisation: input.authorised
        ? "confirmed-authorised-to-publish"
        : "not-confirmed-do-not-submit",
      anonymisation_status: input.anonymised
        ? "confirmed-no-student-identifiers-or-raw-student-material"
        : "needs-human-privacy-review",
      public_data_declaration: input.publicData
        ? "confirmed-public-data"
        : "not-confirmed-do-not-submit",
    },
  };
}

export function publicationAccessError(reason?: string): string | undefined {
  if (reason !== "missing_write_access") return undefined;
  return "Your connected GitHub account needs collaborator write access to evaluchat/research. No branch or pull request was created.";
}

export function LedgerPublicationPanel({
  item,
}: {
  item: LedgerSnapshotWorkspaceItem;
}) {
  const [publication, setPublication] = useState(item.publication);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preview, setPreview] = useState<string>();
  const [previewError, setPreviewError] = useState<string>();
  const [publishError, setPublishError] = useState<string>();
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [authorised, setAuthorised] = useState(false);
  const [anonymised, setAnonymised] = useState(false);
  const [publicData, setPublicData] = useState(false);
  const [rePublish, setRePublish] = useState(false);
  const [pullRequestActual, setPullRequestActual] = useState<{
    state?: string;
    merged?: boolean;
  }>();

  useEffect(() => {
    setPublication(item.publication);
    setPullRequestActual(undefined);
  }, [item.publication]);

  const route = `/api/workspace/items/${encodeURIComponent(item.id)}/ledger/publish`;
  const filePath = `evidence-ledgers/${item.snapshot.ledgerId}.en.md`;

  async function openPreview(nextRePublish = false) {
    setAuthorised(false);
    setAnonymised(false);
    setPublicData(false);
    setPreview(undefined);
    setRePublish(nextRePublish);
    setDialogOpen(true);
    setPreviewError(undefined);
    setPublishError(undefined);
    setIsLoadingPreview(true);
    try {
      const response = await fetch(route, { credentials: "include" });
      const body = (await response.json()) as {
        markdown?: string;
        error?: string;
      };
      if (!response.ok || !body.markdown) {
        throw new Error(
          body.error || "Could not load the publication preview."
        );
      }
      setPreview(body.markdown);
    } catch (error) {
      setPreviewError(
        error instanceof Error
          ? error.message
          : "Could not load the publication preview."
      );
    } finally {
      setIsLoadingPreview(false);
    }
  }

  async function publish() {
    setIsPublishing(true);
    setPublishError(undefined);
    try {
      const response = await fetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          ledgerPublishRequestBody({
            authorised,
            anonymised,
            publicData,
            rePublish,
          })
        ),
      });
      const body = (await response.json()) as {
        publication?: Publication;
        error?: string;
        reason?: string;
      };
      if (!response.ok || !body.publication) {
        throw new Error(
          body.error ||
            publicationAccessError(body.reason) ||
            "Could not publish the ledger snapshot."
        );
      }
      setPublication(body.publication);
      setPullRequestActual(undefined);
      setDialogOpen(false);
    } catch (error) {
      setPublishError(
        error instanceof Error
          ? error.message
          : "Could not publish the ledger snapshot."
      );
    } finally {
      setIsPublishing(false);
    }
  }

  async function refreshStatus() {
    setIsRefreshing(true);
    setPublishError(undefined);
    try {
      const response = await fetch(`${route}/status`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await response.json()) as {
        publication?: Publication;
        actual?: { state?: string; merged?: boolean };
        error?: string;
      };
      if (!response.ok || !body.publication) {
        throw new Error(body.error || "Could not refresh publication status.");
      }
      setPublication(body.publication);
      setPullRequestActual(body.actual);
    } catch (error) {
      setPublishError(
        error instanceof Error
          ? error.message
          : "Could not refresh publication status."
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <section
      className="rounded-lg border bg-card p-5"
      aria-label="Ledger publication"
      data-testid="ledger-publication"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Publish snapshot</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {publicationStatusText(publication, pullRequestActual)}
          </p>
        </div>
        {!publication && (
          <Button
            onClick={() => void openPreview()}
            data-testid="ledger-publish"
          >
            Publish
          </Button>
        )}
        {canRepublishClosedPullRequest(publication, pullRequestActual) && (
          <Button
            onClick={() => void openPreview(true)}
            data-testid="ledger-republish"
          >
            Republish
          </Button>
        )}
        {publication?.status === "draft" && (
          <Button
            variant="outline"
            onClick={() => void refreshStatus()}
            disabled={isRefreshing}
            data-testid="ledger-refresh-publication"
          >
            {isRefreshing ? "Refreshing…" : "Refresh status"}
          </Button>
        )}
      </div>
      {publication?.pullRequestUrl && (
        <a
          href={publication.pullRequestUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm text-primary underline"
        >
          PR #{publication.pullRequestNumber}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      {publication?.status === "draft" && (
        <p className="mt-2 text-sm text-muted-foreground">
          {canRepublishClosedPullRequest(publication, pullRequestActual)
            ? "Draft PR closed without merge. Republish to create a new draft PR."
            : "Pending human merge. This sealed snapshot remains an unpublished workspace artifact until its draft PR merges."}
        </p>
      )}
      {publication?.status === "merged" && (
        <p className="mt-2 text-sm text-emerald-700">
          Merged{publication.mergedAt ? ` at ${publication.mergedAt}` : ""}.
        </p>
      )}
      {publishError && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {publishError}
        </p>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Publish sealed Ledger Snapshot</DialogTitle>
            <DialogDescription>
              This creates one draft PR under your connected GitHub identity. It
              will not merge automatically.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Destination</dt>
              <dd>evaluchat/research</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">File</dt>
              <dd className="font-mono text-xs">{filePath}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Source commit</dt>
              <dd className="break-all font-mono text-xs">
                {item.snapshot.sourceCommit}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Input fingerprint</dt>
              <dd className="break-all font-mono text-xs">
                {item.snapshot.inputFingerprint}
              </dd>
            </div>
          </dl>
          <section>
            <h3 className="text-sm font-medium">Read-only diff preview</h3>
            {isLoadingPreview && (
              <p className="mt-2 text-sm text-muted-foreground">
                Rendering preview…
              </p>
            )}
            {previewError && (
              <p className="mt-2 text-sm text-destructive" role="alert">
                {previewError}
              </p>
            )}
            {preview && (
              <pre
                className="mt-2 max-h-72 overflow-auto rounded-md border bg-muted p-3 text-xs"
                data-testid="ledger-publish-preview"
              >
                {preview}
              </pre>
            )}
          </section>
          <fieldset className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">
              Public-safety declarations
            </legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={authorised}
                onChange={(event) => setAuthorised(event.target.checked)}
                data-testid="ledger-publication-authorisation"
              />
              I am authorised to publish this evidence ledger.
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={anonymised}
                onChange={(event) => setAnonymised(event.target.checked)}
                data-testid="ledger-anonymisation-status"
              />
              It contains no student identifiers or raw student material.
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={publicData}
                onChange={(event) => setPublicData(event.target.checked)}
                data-testid="ledger-public-data-declaration"
              />
              I confirm the rendered file is public data for evaluchat/research.
            </label>
          </fieldset>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void publish()}
              disabled={
                isPublishing ||
                isLoadingPreview ||
                !preview ||
                !authorised ||
                !anonymised ||
                !publicData
              }
              data-testid="ledger-confirm-publish"
            >
              {isPublishing ? "Creating draft PR…" : "Create draft PR"}
            </Button>
          </DialogFooter>
          {publishError && (
            <p className="text-sm text-destructive" role="alert">
              {publishError}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </section>
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
