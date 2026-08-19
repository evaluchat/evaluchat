import { createHash } from "node:crypto";
import type { LedgerConfig, LedgerSnapshotData } from "@opencanvas/shared";
import type {
  EvidenceLedgerContribution,
  EvidenceLedgerManifest,
  LedgerDimensionValue,
} from "@/lib/apparatuses/evidence-ledger";
import type { EvidenceSnapshot } from "./evidence";
import { validateEvidenceSubmission } from "./evidence";

const RESEARCH_BLOB_URL = "https://github.com/evaluchat/research/blob";

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function markdownCell(value: string | number | undefined): string {
  return String(value ?? "—")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

function markdownValue(value: LedgerDimensionValue | undefined): string {
  if (!value) return "unavailable";
  return value.status === "unknown" ? "unknown" : String(value.value);
}

function manifestFor(snapshot: LedgerSnapshotData): EvidenceLedgerManifest {
  const manifest = snapshot.manifest;
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Ledger snapshot has no renderable manifest");
  }
  const candidate = manifest as Partial<EvidenceLedgerManifest>;
  if (!Array.isArray(candidate.contributions)) {
    throw new Error("Ledger snapshot manifest has no contributions");
  }
  return candidate as EvidenceLedgerManifest;
}

function humaniseIdentifier(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function filterSummary(config: LedgerConfig): string {
  if (!config.filters.length) return "all declared evidence";
  return [...config.filters]
    .sort((left, right) => compare(left.fieldId, right.fieldId))
    .map((filter) => {
      if (filter.control === "multi-select") {
        return `${humaniseIdentifier(filter.fieldId)}: ${[...filter.values]
          .sort(compare)
          .join(", ")}`;
      }
      return `${humaniseIdentifier(filter.fieldId)}: ${[
        filter.min === undefined ? undefined : `≥ ${filter.min}`,
        filter.max === undefined ? undefined : `≤ ${filter.max}`,
      ]
        .filter(Boolean)
        .join(", ")}`;
    })
    .join("; ");
}

/** The title is intentionally factual: method identity plus declared scope. */
export function ledgerScopeTitle(
  snapshot: LedgerSnapshotData,
  config: LedgerConfig
): string {
  return `${humaniseIdentifier(snapshot.methodId)} — ${filterSummary(config)}`;
}

function sourceUrl(snapshot: LedgerSnapshotData, path: string): string {
  return `${RESEARCH_BLOB_URL}/${encodeURIComponent(snapshot.sourceCommit)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function contributionLabel(contribution: EvidenceLedgerContribution): string {
  return contribution.id || contribution.path;
}

function renderContributionRows(
  contributions: EvidenceLedgerContribution[],
  snapshot: LedgerSnapshotData
): string[] {
  if (!contributions.length) return ["No source records in this view."];
  return [
    "| Source | Hash | Method | Template | Declared values | Bucket |",
    "| --- | --- | --- | --- | --- | --- |",
    ...[...contributions]
      .sort((left, right) => compare(left.path, right.path))
      .map((contribution) => {
        const values = Object.entries(contribution.dimensionValues || {})
          .sort(([left], [right]) => compare(left, right))
          .map(([field, value]) => `${field}: ${markdownValue(value)}`)
          .join("; ");
        return `| [${markdownCell(contributionLabel(contribution))}](${sourceUrl(snapshot, contribution.path)}) | ${markdownCell(contribution.sourceHash)} | ${markdownCell(contribution.methodId)}@${markdownCell(contribution.methodVersion)} | ${markdownCell(contribution.templateVersion)} | ${markdownCell(values || "—")} | ${markdownCell(contribution.bucket)} |`;
      }),
  ];
}

function renderDistributions(
  contributions: EvidenceLedgerContribution[]
): string[] {
  const counts = new Map<string, number>();
  for (const contribution of contributions) {
    for (const [field, value] of Object.entries(
      contribution.dimensionValues || {}
    )) {
      const key = `${field}\u0000${markdownValue(value)}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  if (!counts.size) return ["Insufficient information for a distribution."];
  return [
    "| Field | Recorded value | Count |",
    "| --- | --- | ---: |",
    ...[...counts.entries()]
      .sort(([left], [right]) => compare(left, right))
      .map(([key, count]) => {
        const [field, value] = key.split("\u0000");
        return `| ${markdownCell(field)} | ${markdownCell(value)} | ${count} |`;
      }),
  ];
}

function renderCanonicalManifest(
  contributions: EvidenceLedgerContribution[]
): string[] {
  const lines = ["```yaml", "contributions:"];
  for (const contribution of [...contributions].sort((left, right) =>
    compare(left.path, right.path)
  )) {
    lines.push(`  - path: ${JSON.stringify(contribution.path)}`);
    lines.push(`    hash: ${JSON.stringify(contribution.sourceHash || "")}`);
    lines.push(
      `    method: { id: ${JSON.stringify(contribution.methodId || "")}, version: ${JSON.stringify(contribution.methodVersion || "")} }`
    );
    lines.push(
      `    template_version: ${JSON.stringify(contribution.templateVersion || "")}`
    );
    lines.push(`    bucket: ${JSON.stringify(contribution.bucket)}`);
    lines.push("    dimension_values:");
    const values = Object.entries(contribution.dimensionValues || {}).sort(
      ([left], [right]) => compare(left, right)
    );
    if (!values.length) lines.push("      {}");
    for (const [field, value] of values) {
      lines.push(
        `      ${JSON.stringify(field)}: { status: ${JSON.stringify(value.status)}, value: ${JSON.stringify(value.value)} }`
      );
    }
  }
  lines.push("```");
  return lines;
}

/**
 * Render the portion of an artifact whose hash is stored in frontmatter.
 * Frontmatter cannot be included in its own hash without a circular value.
 */
export function renderLedgerBody(
  snapshot: LedgerSnapshotData,
  _config: LedgerConfig
): string {
  const manifest = manifestFor(snapshot);
  const contributions = [...manifest.contributions].sort((left, right) =>
    compare(left.path, right.path)
  );
  const included = contributions.filter(
    (contribution) => contribution.bucket === "Included"
  );
  const gaps = contributions.filter(
    (contribution) => contribution.bucket !== "Included"
  );
  const bucketRows = Object.entries(snapshot.buckets).sort(([left], [right]) =>
    compare(left, right)
  );

  return [
    "# Evidence Ledger",
    "",
    "## Scope",
    "",
    `Canonical predicate: \`${snapshot.predicate}\``,
    "",
    "| Bucket | Count |",
    "| --- | ---: |",
    ...bucketRows.map(([bucket, count]) => `| ${bucket} | ${count} |`),
    "",
    "## Evidence",
    "",
    ...renderContributionRows(included, snapshot),
    "",
    "## Descriptive distributions",
    "",
    ...renderDistributions(included),
    "",
    "## Comparability",
    "",
    `The fixed comparison boundary is ${snapshot.methodId}@${snapshot.methodVersion} with ${snapshot.templateId}@${snapshot.templateVersion}.`,
    "",
    `Included source records: ${included.length}. Declared values retain recorded, unknown, unavailable, not-applicable, and insufficient-information values without inference.`,
    "",
    "## Counterevidence and gaps",
    "",
    "Scope exclusions, missingness, and invalid provenance remain visible below. No interpretation is generated.",
    "",
    ...renderContributionRows(gaps, snapshot),
    "",
    "## Canonical manifest",
    "",
    ...renderCanonicalManifest(contributions),
    "",
  ].join("\n");
}

export function ledgerRenderHash(
  snapshot: LedgerSnapshotData,
  config: LedgerConfig
): string {
  return sha256(renderLedgerBody(snapshot, config));
}

export function renderLedgerMarkdown(
  snapshot: LedgerSnapshotData,
  config: LedgerConfig
): string {
  const body = renderLedgerBody(snapshot, config);
  const renderHash = snapshot.renderHash || sha256(body);
  return [
    "---",
    "type: Evidence Ledger",
    `id: ${yamlScalar(snapshot.ledgerId)}`,
    "lang: en",
    "origin: native",
    "status: stable",
    `title: ${yamlScalar(ledgerScopeTitle(snapshot, config))}`,
    "description: Source-linked descriptive ledger for one Method and declared evidence scope.",
    `method: { id: ${yamlScalar(snapshot.methodId)}, version: ${yamlScalar(snapshot.methodVersion)} }`,
    `evidence_template: { id: ${yamlScalar(snapshot.templateId)}, version: ${yamlScalar(snapshot.templateVersion)} }`,
    `scope: ${yamlScalar(snapshot.predicate)}`,
    `source_commit: ${yamlScalar(snapshot.sourceCommit)}`,
    `input_fingerprint: ${yamlScalar(snapshot.inputFingerprint)}`,
    `render_hash: ${yamlScalar(renderHash)}`,
    `resolver_version: ${yamlScalar(snapshot.resolverVersion)}`,
    `generated: { by: ${yamlScalar(`evaluchat-ledger-service/${snapshot.resolverVersion}`)}, at: ${yamlScalar(snapshot.generatedAt)} }`,
    "---",
    "",
    body,
  ].join("\n");
}

/**
 * Reuse the evidence-submission validator for the two public-safety
 * declarations. A ledger has no mutable evidence narrative; its sealed
 * manifest supplies the immutable provenance values.
 */
export function validateLedgerPublicationDeclarations(
  snapshot: LedgerSnapshotData,
  rawValues: unknown
) {
  const evidenceSnapshot: EvidenceSnapshot = {
    kind: "evidence",
    templateId: "evidence-template",
    templateVersion: snapshot.templateVersion,
    sourcePath: `evidence-ledgers/${snapshot.ledgerId}.en.md`,
    guidance: "",
    layoutMarkdown: "",
    fields: {
      publication_authorisation: {
        id: "publication_authorisation",
        label: "Public authorisation",
        type: "select",
        required: true,
        options: [
          "confirmed-authorised-to-publish",
          "not-confirmed-do-not-submit",
        ],
      },
      anonymisation_status: {
        id: "anonymisation_status",
        label: "Anonymisation",
        type: "select",
        required: true,
        options: [
          "confirmed-no-student-identifiers-or-raw-student-material",
          "needs-human-privacy-review",
        ],
      },
    },
    frozenValues: {},
    methodId: snapshot.methodId,
    methodVersion: snapshot.methodVersion,
    workspaceItemId: snapshot.ledgerId,
    runId: snapshot.inputFingerprint,
  };
  return validateEvidenceSubmission(evidenceSnapshot, rawValues);
}
