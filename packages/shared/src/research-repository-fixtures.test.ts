import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { LedgerSealManifestV1Schema } from "./research-repository.js";

const fixturesRoot = join(__dirname, "fixtures/research-repository");

/** Layout path stubs only — research markdown SoT is evaluchat/research (see fixture-metadata.json). */

const prescribedLayout = [
  ".evaluchat/workspace.yml",
  ".gitignore",
  "CITATION.cff",
  "README.md",
  "findings/synthetic-finding.en.md",
  "index.md",
  "methods/synthetic-method/evidence-template.en.md",
  "methods/synthetic-method/evidence/ledgers/synthetic-snapshot.en.md",
  "methods/synthetic-method/evidence/ledgers/synthetic-snapshot.seal.yml",
  "methods/synthetic-method/evidence/synthetic-evidence.en.md",
  "methods/synthetic-method/synthetic-method.en.md",
  "theory/synthetic-question.en.md",
].sort();

type FixtureMetadata = {
  canonicalContent?: {
    repository: string;
    branch: string;
    methodRoot: string;
    theoryQuestion: string;
    note: string;
  };
  supportedReaderVersion: string;
  compatibility: {
    supportedVersionAccess: string;
    unsupportedMajorAccess: string;
    laterMinorAccess: string;
    rule: string;
  };
  fixtures: Record<
    string,
    { root: string; layoutVersion: string; expectedAccess: string }
  >;
};

function listFixtureFiles(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listFixtureFiles(root, path);
    }
    expect(entry.isSymbolicLink()).toBe(false);
    return [relative(root, path)];
  });
}

function readMetadata(): FixtureMetadata {
  return JSON.parse(
    readFileSync(join(fixturesRoot, "fixture-metadata.json"), "utf8")
  ) as FixtureMetadata;
}

describe("research repository layout fixtures", () => {
  it.each(["v1.0", "v1.1"])(
    "%s contains exactly the prescribed v1 managed paths",
    (version) => {
      const fixtureRoot = join(fixturesRoot, version);
      expect(listFixtureFiles(fixtureRoot).sort()).toEqual(prescribedLayout);

      const workspaceManifest = readFileSync(
        join(fixtureRoot, ".evaluchat/workspace.yml"),
        "utf8"
      );
      expect(workspaceManifest).toContain(
        `layout_version: "${version.slice(1)}"`
      );
      expect(workspaceManifest).toContain(
        "managed_branch: evaluchat/workspace"
      );

      for (const path of prescribedLayout) {
        expect(readFileSync(join(fixtureRoot, path), "utf8")).toMatch(
          /synthetic/i
        );
      }
    }
  );

  it("documents writable v1.0 and read-only compatibility fallbacks", () => {
    const metadata = readMetadata();

    expect(metadata.canonicalContent?.repository).toBe("evaluchat/research");
    expect(metadata.canonicalContent?.methodRoot).toBe(
      "methods/synthetic-method"
    );
    expect(metadata.supportedReaderVersion).toBe("1.0");
    expect(metadata.compatibility.supportedVersionAccess).toBe("read-write");
    expect(metadata.compatibility.unsupportedMajorAccess).toBe("read-only");
    expect(metadata.compatibility.laterMinorAccess).toBe("read-only");
    expect(metadata.compatibility.rule).toMatch(
      /unsupported major.*later unsupported minor.*read-only/i
    );
    expect(metadata.fixtures["v1.0"]).toMatchObject({
      layoutVersion: "1.0",
      expectedAccess: "read-write",
    });
    expect(metadata.fixtures["v1.1"]).toMatchObject({
      layoutVersion: "1.1",
      expectedAccess: "read-only",
    });
  });

  it("uses unknown frontmatter in the future-minor fixture for preservation", () => {
    const futureQuestion = readFileSync(
      join(fixturesRoot, "v1.1/theory/synthetic-question.en.md"),
      "utf8"
    );
    expect(futureQuestion).toContain(
      "future_minor_note: preserved by compatible readers"
    );
  });

  it("round-trips unknown v1.1 seal fields and rejects invalid core fields", () => {
    const fixture = yaml.load(
      readFileSync(
        join(
          fixturesRoot,
          "v1.1/methods/synthetic-method/evidence/ledgers/synthetic-snapshot.seal.yml"
        ),
        "utf8"
      ),
      { schema: yaml.FAILSAFE_SCHEMA }
    );
    const parsed = LedgerSealManifestV1Schema.parse(fixture);

    expect((parsed as Record<string, unknown>).future_minor_note).toBe(
      "preserved by compatible readers"
    );
    expect(
      LedgerSealManifestV1Schema.safeParse({
        ...(fixture as Record<string, unknown>),
        sealed_from_commit: "not-a-commit",
      }).success
    ).toBe(false);
  });
});
