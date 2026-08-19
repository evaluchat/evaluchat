"use client";

import { useState } from "react";
import type { EvidenceLedgerManifest } from "@/lib/apparatuses/evidence-ledger";
import type { LedgerSnapshotWorkspaceItem } from "@/lib/workspace/types";

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
