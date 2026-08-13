#!/usr/bin/env tsx

/**
 * Generate the web app's checked-in apparatus catalog from the public Research
 * OKF. The generated artifact is deliberately data-only; the app maps ids to
 * reviewed built-in implementations and never executes repository code.
 *
 * Usage:
 *   RESEARCH_OKF_ROOT=/path/to/okf/research yarn generate:apparatus
 *
 * When the repositories are checked out side-by-side, the sibling Research
 * checkout is discovered automatically.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const researchRoot =
  process.env.RESEARCH_OKF_ROOT || path.resolve(repoRoot, "../okf/research");
const sourcePath = path.join(
  researchRoot,
  "apparatus",
  "ai-assisted-essay",
  "ai-assisted-essay.en.md"
);
const outputPath = path.join(
  repoRoot,
  "apps",
  "web",
  "data",
  "apparatuses.generated.json"
);

if (!fs.existsSync(sourcePath)) {
  throw new Error(
    `Research apparatus source not found at ${sourcePath}. Set RESEARCH_OKF_ROOT to the Research OKF checkout.`
  );
}

const source = fs.readFileSync(sourcePath, "utf8");
const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
if (!match) {
  throw new Error(`Apparatus source has no YAML frontmatter: ${sourcePath}`);
}

const frontmatter = yaml.load(match[1]) as Record<string, unknown>;
const id = String(frontmatter.id || "");
const version = String(frontmatter.version || "");
const minCanvasVersion = String(
  frontmatter.min_canvas_version || frontmatter.min_platform || ""
);
if (!id || !version || !minCanvasVersion) {
  throw new Error(
    `Apparatus source must declare id, version, and min_canvas_version: ${sourcePath}`
  );
}

const entry = {
  ...frontmatter,
  name: String(frontmatter.title || id),
  version,
  min_canvas_version: minCanvasVersion,
  min_platform: String(frontmatter.min_platform || minCanvasVersion),
};
delete (entry as Record<string, unknown>).type;
delete (entry as Record<string, unknown>).lang;
delete (entry as Record<string, unknown>).origin;
delete (entry as Record<string, unknown>).title;
delete (entry as Record<string, unknown>).question;

const artifact = {
  version: 2,
  canvas_version: minCanvasVersion,
  apparatuses: [entry],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(`${outputPath}`, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Generated ${path.relative(repoRoot, outputPath)} from ${sourcePath}`);
