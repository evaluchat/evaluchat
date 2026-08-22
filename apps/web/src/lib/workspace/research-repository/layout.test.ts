import { describe, expect, it } from "vitest";
import {
  assertSafeRepositoryArtifactPath,
  identifyRepositoryArtifactPath,
  RepositoryLayoutError,
  resolveRepositoryArtifactPath,
  validateRepositoryArtifactContent,
  validateRepositoryArtifactCount,
  validateRepositoryArtifactMode,
} from "./layout";

describe("research repository layout 1.0", () => {
  it.each([
    ["index", "index.md", "index"],
    ["theory.question-one", "theory/question-one.en.md", "theory"],
    [
      "method.synthetic-method",
      "methods/synthetic-method/synthetic-method.en.md",
      "method",
    ],
    [
      "evidence-template.synthetic-method",
      "methods/synthetic-method/evidence-template.en.md",
      "evidence_template",
    ],
    [
      "evidence.synthetic-method.source-one",
      "methods/synthetic-method/evidence/source-one.en.md",
      "evidence",
    ],
    [
      "ledger.synthetic-method.snapshot-one",
      "methods/synthetic-method/evidence/ledgers/snapshot-one.en.md",
      "ledger",
    ],
    [
      "ledger-seal.synthetic-method.snapshot-one",
      "methods/synthetic-method/evidence/ledgers/snapshot-one.seal.yml",
      "ledger_seal",
    ],
    ["finding.result-one", "findings/result-one.en.md", "finding"],
    ["workspace-manifest", ".evaluchat/workspace.yml", "workspace_manifest"],
    ["readme", "README.md", "readme"],
    ["citation", "CITATION.cff", "citation"],
    ["gitignore", ".gitignore", "gitignore"],
  ])("resolves %s to its server-owned path", (artifactId, path, kind) => {
    expect(resolveRepositoryArtifactPath(artifactId)).toEqual({
      artifactId,
      path,
      kind,
    });
    expect(identifyRepositoryArtifactPath(path)).toEqual({
      artifactId,
      path,
      kind,
    });
  });

  it.each([
    "../private.md",
    "methods/../private.md",
    "/index.md",
    "methods/link.symlink/file.md",
    "methods/link.lnk/file.md",
  ])("rejects unsafe or symlink-looking path %s", (path) => {
    expect(() => assertSafeRepositoryArtifactPath(path)).toThrow(
      RepositoryLayoutError
    );
  });

  it.each(["notes.lnk", "foo->bar.md", "methods/../private.md"])(
    "ignores unmanaged discovery path %s",
    (path) => {
      expect(identifyRepositoryArtifactPath(path)).toBeUndefined();
    }
  );

  it("rejects executable names, executable modes, and symlink modes", () => {
    expect(() => resolveRepositoryArtifactPath("payload.exe")).toThrow(
      RepositoryLayoutError
    );
    expect(() =>
      validateRepositoryArtifactContent("payload.exe", "content")
    ).toThrow(RepositoryLayoutError);
    expect(() => validateRepositoryArtifactMode("index.md", "100755")).toThrow(
      /non-executable/
    );
    expect(() => validateRepositoryArtifactMode("index.md", "120000")).toThrow(
      /symbolic link/
    );
  });

  it("enforces the 1 MB content and 1000 managed artifact limits", () => {
    expect(() =>
      validateRepositoryArtifactContent("index.md", "x".repeat(1024 * 1024))
    ).not.toThrow();
    expect(() =>
      validateRepositoryArtifactContent("index.md", "x".repeat(1024 * 1024 + 1))
    ).toThrow(/1 MB/);
    expect(() => validateRepositoryArtifactCount(1000)).not.toThrow();
    expect(() => validateRepositoryArtifactCount(1001)).toThrow(/1000/);
  });
});
