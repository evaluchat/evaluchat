import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  EvidenceLedgerResolutionError,
  resolveEvidenceLedger,
  type LedgerScopeFilter,
} from "./evidence-ledger";

const temporaryDirectories: string[] = [];

function researchRoot(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "evaluchat-evidence-ledger-")
  );
  temporaryDirectories.push(directory);
  return directory;
}

function writeQuestion(root: string, id = "question-one"): void {
  const directory = path.join(root, "theory");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, `${id}.en.md`),
    `---
type: Theory
id: ${id}
title: ${id} title
version: 1.0.0
---

# ${id}
`
  );
}

function writeMethod(
  root: string,
  id: string,
  questionId = "question-one"
): void {
  const directory = path.join(root, "methods", id);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, `${id}.en.md`),
    `---
type: Method
id: ${id}
version: 1.0.0
research_questions: [${questionId}]
---

# ${id}
`
  );
}

function writeTemplate(
  root: string,
  methodId: string,
  version: string,
  fields: string,
  filename = "evidence-template.en.md"
): void {
  const directory = path.join(root, "methods", methodId);
  fs.writeFileSync(
    path.join(directory, filename),
    `---
type: Form Template
id: evidence-template
version: ${version}
template_kind: form
applies_to_method: ${methodId}@1.0.0
question_id: question-one
fields:
${fields}
---

# Evidence
`
  );
}

function writeEvidence(
  root: string,
  methodId: string,
  id: string,
  templateVersion: string,
  status: "accepted" | "draft",
  fieldValues: string,
  provenance = ""
): void {
  const directory = path.join(root, "methods", methodId, "evidence");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, `${id}.md`),
    `---
type: Evidence Contribution
id: ${id}
status: ${status}
method:
  id: ${methodId}
  version: 1.0.0
provenance:
  template_id: evidence-template
  template_version: ${templateVersion}
${provenance}field_values:
${fieldValues}
---

# Narrative outcome that the resolver must not read
`
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const alphaFields = `  education_level:
    type: select
    options: [k12, adult, unknown]
    missing_semantics: unknown
    ledger_dimension:
      role: context
      control: multi-select
  outcome:
    type: textarea`;

const betaFields = `  education_level:
    type: select
    options: [k12, adult, unknown]
    missing_semantics: unknown
    ledger_dimension:
      role: context
      control: multi-select
  collection_date:
    type: date
    missing_semantics: unknown
    ledger_dimension:
      role: collection
      control: range
  outcome:
    type: textarea`;

describe("Evidence Ledger resolver", () => {
  it("returns a deterministic empty ledger for the current no-evidence state", () => {
    const root = researchRoot();
    writeQuestion(root);
    writeMethod(root, "alpha-method");
    writeTemplate(root, "alpha-method", "1.0.0", alphaFields);

    const first = resolveEvidenceLedger({
      researchRoot: root,
      questionId: "question-one",
    });
    const second = resolveEvidenceLedger({
      researchRoot: root,
      questionId: "question-one",
    });

    expect(first.question).toEqual({
      id: "question-one",
      title: "question-one title",
      path: "theory/question-one.en.md",
      version: "1.0.0",
    });
    expect(first.methods).toEqual([
      {
        id: "alpha-method",
        version: "1.0.0",
        path: "methods/alpha-method/alpha-method.en.md",
        evidenceTemplate: {
          id: "evidence-template",
          version: "1.0.0",
          path: "methods/alpha-method/evidence-template.en.md",
          dimensions: [
            {
              id: "education_level",
              type: "select",
              role: "context",
              control: "multi-select",
              options: ["k12", "adult", "unknown"],
              missingSemantics: "unknown",
            },
          ],
        },
      },
    ]);
    expect(first.contributions).toEqual([]);
    expect(first.scope.baselineCount).toBe(0);
    expect(first.manifestHash).toBe(second.manifestHash);
  });

  it("merges contributing methods and keeps unknown, unavailable, and exclusions distinct", () => {
    const root = researchRoot();
    writeQuestion(root);
    writeMethod(root, "alpha-method");
    writeMethod(root, "beta-method");
    writeMethod(root, "unlinked-method", "other-question");
    writeTemplate(root, "alpha-method", "1.0.0", alphaFields);
    writeTemplate(root, "beta-method", "2.0.0", betaFields);

    writeEvidence(
      root,
      "alpha-method",
      "alpha-k12",
      "1.0.0",
      "accepted",
      "  education_level: k12\n  outcome: positive"
    );
    writeEvidence(
      root,
      "beta-method",
      "beta-k12",
      "2.0.0",
      "accepted",
      '  education_level: k12\n  collection_date: "2026-02-01"\n  outcome: positive'
    );
    writeEvidence(
      root,
      "beta-method",
      "beta-adult",
      "2.0.0",
      "accepted",
      '  education_level: adult\n  collection_date: "2026-02-01"\n  outcome: negative'
    );
    writeEvidence(
      root,
      "beta-method",
      "beta-unknown",
      "2.0.0",
      "accepted",
      '  education_level: unknown\n  collection_date: "2026-02-01"\n  outcome: mixed'
    );
    writeEvidence(
      root,
      "beta-method",
      "beta-draft",
      "2.0.0",
      "draft",
      '  education_level: k12\n  collection_date: "2026-02-01"'
    );
    writeEvidence(
      root,
      "beta-method",
      "beta-invalid-provenance",
      "9.9.9",
      "accepted",
      '  education_level: k12\n  collection_date: "2026-02-01"'
    );
    writeEvidence(
      root,
      "unlinked-method",
      "unlinked-evidence",
      "1.0.0",
      "accepted",
      "  education_level: k12"
    );

    const filters: LedgerScopeFilter[] = [
      {
        fieldId: "collection_date",
        control: "range",
        min: "2026-01-01",
        max: "2026-12-31",
      },
      {
        fieldId: "education_level",
        control: "multi-select",
        values: ["k12"],
      },
    ];
    const result = resolveEvidenceLedger({
      researchRoot: root,
      questionId: "question-one",
      filters,
    });

    expect(result.methods.map((method) => method.id)).toEqual([
      "alpha-method",
      "beta-method",
    ]);
    expect(result.scope).toEqual({
      filters: [
        {
          fieldId: "collection_date",
          control: "range",
          min: "2026-01-01",
          max: "2026-12-31",
        },
        {
          fieldId: "education_level",
          control: "multi-select",
          values: ["k12"],
        },
      ],
      baselineCount: 4,
      bucketCounts: {
        Included: 1,
        "Outside declared scope": 1,
        Unknown: 1,
        Unavailable: 1,
        "Resolver exclusion": 3,
      },
    });

    const byId = new Map(result.contributions.map((item) => [item.id, item]));
    expect(byId.get("alpha-k12")).toMatchObject({
      bucket: "Unavailable",
      templateVersion: "1.0.0",
      scopeValues: { collection_date: { status: "unavailable" } },
    });
    expect(byId.get("beta-k12")).toMatchObject({
      bucket: "Included",
      templateVersion: "2.0.0",
      dimensionValues: {
        collection_date: { status: "recorded", value: "2026-02-01" },
        education_level: { status: "recorded", value: "k12" },
      },
    });
    expect(byId.get("beta-k12")?.dimensionValues).not.toHaveProperty("outcome");
    expect(byId.get("beta-adult")).toMatchObject({
      bucket: "Outside declared scope",
    });
    expect(byId.get("beta-unknown")).toMatchObject({
      bucket: "Unknown",
      dimensionValues: {
        education_level: { status: "unknown", value: "unknown" },
      },
    });
    expect(byId.get("beta-draft")).toMatchObject({
      bucket: "Resolver exclusion",
      exclusionReason: "not accepted",
    });
    expect(byId.get("beta-invalid-provenance")).toMatchObject({
      bucket: "Resolver exclusion",
      exclusionReason: "invalid provenance",
    });
    expect(byId.get("unlinked-evidence")).toMatchObject({
      bucket: "Resolver exclusion",
      exclusionReason: "unlinked question",
    });
    expect(
      result.contributions.map((contribution) => contribution.path)
    ).toEqual(
      [...result.contributions.map((contribution) => contribution.path)].sort()
    );
    expect(result.manifestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects forged predicates over undeclared outcome fields", () => {
    const root = researchRoot();
    writeQuestion(root);
    writeMethod(root, "alpha-method");
    writeTemplate(root, "alpha-method", "1.0.0", alphaFields);

    expect(() =>
      resolveEvidenceLedger({
        researchRoot: root,
        questionId: "question-one",
        filters: [
          {
            fieldId: "outcome",
            control: "multi-select",
            values: ["positive"],
          },
        ],
      })
    ).toThrow(EvidenceLedgerResolutionError);
    expect(() =>
      resolveEvidenceLedger({
        researchRoot: root,
        questionId: "question-one",
        filters: [
          {
            fieldId: "outcome",
            control: "multi-select",
            values: ["positive"],
          },
        ],
      })
    ).toThrow(/not declared by an eligible evidence template/);
  });

  it("rejects selected values absent from a historical ledger dimension", () => {
    const root = researchRoot();
    writeQuestion(root);
    writeMethod(root, "alpha-method");
    writeTemplate(root, "alpha-method", "1.0.0", alphaFields);
    writeTemplate(
      root,
      "alpha-method",
      "0.9.0",
      `  education_level:
    type: select
    options: [k12, unknown]
    missing_semantics: unknown
    ledger_dimension:
      role: context
      control: multi-select`,
      "evidence-template@0.9.0.en.md"
    );

    expect(() =>
      resolveEvidenceLedger({
        researchRoot: root,
        questionId: "question-one",
        filters: [
          {
            fieldId: "education_level",
            control: "multi-select",
            values: ["adult"],
          },
        ],
      })
    ).toThrow(/uses a value not declared by every applicable template/);
  });
});
