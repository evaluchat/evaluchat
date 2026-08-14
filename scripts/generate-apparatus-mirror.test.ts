import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildApparatusMirror,
  assertMethodRunBriefsBound,
} from "./generate-apparatus-mirror";

const temporaryDirectories: string[] = [];

function researchRoot(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "evaluchat-research-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function writeMethod(root: string, id: string, frontmatter: string): string {
  const directory = path.join(root, "methods", id);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${id}.en.md`);
  fs.writeFileSync(
    file,
    `---
${frontmatter}
---

# ${id}
`,
  );
  return file;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const methodFrontmatter = `type: Method
id: ai-assisted-essay
lang: en
version: 0.1.0
min_canvas_version: "0.5.9"
title: AI-assisted essay
description: Constrained dialogic drafting.
levers:
  - id: tracking
    type: boolean
    default: true
    effect: Process telemetry.
run_brief_template: evaluchat-assignment-brief@1.0.0
platform:
  participant_invitations: required
  review_surface: essay-process-review
profiles:
  - id: canonical-constrained-dialogue
    version: 1.0.0
    immutable: true
    configuration: { tracking: true }`;

describe("apparatus mirror generator", () => {
  it("reads methods/<id>/ and maps levers to knobs", () => {
    const root = researchRoot();
    writeMethod(root, "ai-assisted-essay", methodFrontmatter);

    const artifact = buildApparatusMirror(root);
    const entry = artifact.apparatuses[0];

    expect(entry.id).toBe("ai-assisted-essay");
    expect(entry.knobs).toEqual([
      {
        id: "tracking",
        type: "boolean",
        default: true,
        effect: "Process telemetry.",
      },
    ]);
    expect(entry).not.toHaveProperty("levers");
    expect(entry.run_brief_template).toBe("evaluchat-assignment-brief@1.0.0");
    expect(entry.platform).toEqual({
      participant_invitations: "required",
      review_surface: "essay-process-review",
    });
  });

  it("does not read the retired apparatus/ path", () => {
    const root = researchRoot();
    const retired = path.join(
      root,
      "apparatus",
      "ai-assisted-essay",
      "ai-assisted-essay.en.md",
    );
    fs.mkdirSync(path.dirname(retired), { recursive: true });
    fs.writeFileSync(
      retired,
      `---
id: ai-assisted-essay
version: 0.1.0
min_canvas_version: "0.5.9"
title: Retired apparatus
knobs:
  - id: tracking
    type: boolean
    default: true
---
`,
    );

    expect(() => buildApparatusMirror(root)).toThrow(/methods/);
  });

  it("rejects a builtin method whose run brief is not a platform Form template", () => {
    expect(() =>
      assertMethodRunBriefsBound(
        [
          {
            id: "ai-assisted-essay",
            run_brief_template: "missing-brief@1.0.0",
          },
        ],
        [
          {
            id: "evaluchat-assignment-brief",
            version: "1.0.0",
            templateKind: "form",
          },
        ],
      ),
    ).toThrow(/not a platform Form template/);

    expect(() =>
      assertMethodRunBriefsBound(
        [
          {
            id: "ai-assisted-essay",
            run_brief_template: "evaluchat-assignment-brief@9.9.9",
          },
        ],
        [
          {
            id: "evaluchat-assignment-brief",
            version: "1.0.0",
            templateKind: "form",
          },
        ],
      ),
    ).toThrow(/does not match platform version/);
  });
});
