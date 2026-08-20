"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import type { LedgerSnapshotWorkspaceItem } from "@/lib/workspace/types";
import { ledgerEvidenceFilePath } from "@/lib/workspace/ledger-paths";
import {
  canRepublishClosedPullRequest,
  ledgerPublishRequestBody,
  publicationAccessError,
  publicationStatusText,
} from "@/lib/workspace/ledger-publication";
import { Button } from "@/components/ui/button";

type Publication = NonNullable<LedgerSnapshotWorkspaceItem["publication"]>;

export function LedgerPublishPage({
  item,
}: {
  item: LedgerSnapshotWorkspaceItem;
}) {
  const [publication, setPublication] = useState(item.publication);
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

  const route = `/api/workspace/items/${encodeURIComponent(item.id)}/ledger/publish`;
  const snapshotHref = `/workspace/items/${encodeURIComponent(item.id)}`;
  const ledgerHref = `/workspace/items/${encodeURIComponent(item.parentLedgerItemId)}`;
  const filePath = ledgerEvidenceFilePath(
    item.snapshot.ledgerId,
    item.snapshot.methodId
  );

  async function openPreview(nextRePublish = false) {
    setAuthorised(false);
    setAnonymised(false);
    setPublicData(false);
    setPreview(undefined);
    setRePublish(nextRePublish);
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

  useEffect(() => {
    setPublication(item.publication);
    setPullRequestActual(undefined);
  }, [item.publication]);

  useEffect(() => {
    void openPreview();
    // The preview must be refreshed when the routed snapshot changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const canPublish =
    !publication ||
    canRepublishClosedPullRequest(publication, pullRequestActual);

  return (
    <main className="w-full space-y-6 p-6" data-testid="ledger-publish-page">
      <header className="space-y-2">
        <nav
          aria-label="Ledger publish navigation"
          className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
          data-testid="ledger-publish-breadcrumb"
        >
          <Link
            href="/workspace"
            className="hover:text-foreground hover:underline"
          >
            Workspace
          </Link>
          <ChevronRight className="h-4 w-4" aria-hidden />
          <Link
            href={ledgerHref}
            className="hover:text-foreground hover:underline"
          >
            Evidence Ledger
          </Link>
          <ChevronRight className="h-4 w-4" aria-hidden />
          <Link
            href={snapshotHref}
            className="hover:text-foreground hover:underline"
          >
            Ledger Snapshot
          </Link>
          <ChevronRight className="h-4 w-4" aria-hidden />
          <span aria-current="page" className="font-medium text-foreground">
            Publish
          </span>
        </nav>
        <div>
          <h1 className="text-xl font-semibold">
            Publish sealed Ledger Snapshot
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create one draft PR under your connected GitHub identity. It will
            not merge automatically.
          </p>
        </div>
      </header>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)]">
        <section className="min-w-0 rounded-lg border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Read-only diff preview</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openPreview(rePublish)}
              disabled={isLoadingPreview}
              data-testid="ledger-refresh-preview"
            >
              {isLoadingPreview ? "Rendering…" : "Refresh preview"}
            </Button>
          </div>
          <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-muted-foreground">Destination</dt>
              <dd>evaluchat/research</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">File</dt>
              <dd className="break-all font-mono text-xs">{filePath}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Source commit</dt>
              <dd className="break-all font-mono text-xs">
                {item.snapshot.sourceCommit}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Input fingerprint</dt>
              <dd className="break-all font-mono text-xs">
                {item.snapshot.inputFingerprint}
              </dd>
            </div>
          </dl>
          {previewError && (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {previewError}
            </p>
          )}
          {preview && (
            <pre
              className="mt-4 min-w-0 whitespace-pre-wrap break-words rounded-md border bg-muted p-3 text-xs"
              data-testid="ledger-publish-preview"
            >
              {preview}
            </pre>
          )}
        </section>

        <section className="min-w-0 rounded-lg border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Publication status</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {publicationStatusText(publication, pullRequestActual)}
              </p>
            </div>
            {publication?.status === "draft" && (
              <Button
                variant="outline"
                size="sm"
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
            <p className="mt-3 text-sm text-muted-foreground">
              {canRepublishClosedPullRequest(publication, pullRequestActual)
                ? "Draft PR closed without merge. Republish to create a new draft PR."
                : "Pending human merge. This sealed snapshot remains an unpublished workspace artifact until its draft PR merges."}
            </p>
          )}
          {publication?.status === "merged" && (
            <p className="mt-3 text-sm text-emerald-700">
              Merged{publication.mergedAt ? ` at ${publication.mergedAt}` : ""}.
            </p>
          )}
          {canRepublishClosedPullRequest(publication, pullRequestActual) && (
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={() => void openPreview(true)}
              data-testid="ledger-republish"
            >
              Republish
            </Button>
          )}
          <fieldset className="mt-5 min-w-0 space-y-3 rounded-md border p-3">
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
          <Button
            className="mt-5 w-full"
            onClick={() => void publish()}
            disabled={
              !canPublish ||
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
          {publishError && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {publishError}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
