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
  "..",
);

/** Executable methods the app can instantiate. Other Research methods stay catalog-only. */
export const BUILTIN_METHOD_IDS = ["ai-assisted-essay"] as const;

type MethodFrontmatter = Record<string, unknown>;

function parseFrontmatter(
  source: string,
  sourcePath: string,
): MethodFrontmatter {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) {
    throw new Error(`Apparatus source has no YAML frontmatter: ${sourcePath}`);
  }
  return yaml.load(match[1]) as MethodFrontmatter;
}

export function buildApparatusEntry(
  frontmatter: MethodFrontmatter,
  sourcePath: string,
): Record<string, unknown> {
  const id = String(frontmatter.id || "");
  const version = String(frontmatter.version || "");
  const minCanvasVersion = String(
    frontmatter.min_canvas_version || frontmatter.min_platform || "",
  );
  if (!id || !version || !minCanvasVersion) {
    throw new Error(
      `Apparatus source must declare id, version, and min_canvas_version: ${sourcePath}`,
    );
  }

  const knobs = frontmatter.levers ?? frontmatter.knobs;
  const entry: Record<string, unknown> = {
    ...frontmatter,
    knobs,
    name: String(frontmatter.title || id),
    version,
    min_canvas_version: minCanvasVersion,
    min_platform: String(frontmatter.min_platform || minCanvasVersion),
  };
  delete entry.levers;
  delete entry.type;
  delete entry.lang;
  delete entry.origin;
  delete entry.title;
  delete entry.question;
  return entry;
}

export function buildApparatusMirror(researchRoot: string): {
  version: number;
  canvas_version: string;
  apparatuses: Record<string, unknown>[];
} {
  const methodsRoot = path.join(researchRoot, "methods");
  if (!fs.existsSync(methodsRoot)) {
    throw new Error(
      `Research methods source not found at ${methodsRoot}. Set RESEARCH_OKF_ROOT to the Research OKF checkout.`,
    );
  }

  const apparatuses: Record<string, unknown>[] = [];
  for (const id of BUILTIN_METHOD_IDS) {
    const sourcePath = path.join(methodsRoot, id, `${id}.en.md`);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(
        `Research method source not found at ${sourcePath}. Set RESEARCH_OKF_ROOT to the Research OKF checkout.`,
      );
    }
    const source = fs.readFileSync(sourcePath, "utf8");
    apparatuses.push(
      buildApparatusEntry(parseFrontmatter(source, sourcePath), sourcePath),
    );
  }

  const canvasVersion = String(apparatuses[0]?.min_canvas_version || "0.5.9");
  return {
    version: 2,
    canvas_version: canvasVersion,
    apparatuses,
  };
}

export function parseRunBriefRef(ref: string): {
  id: string;
  version?: string;
} {
  const at = ref.lastIndexOf("@");
  if (at <= 0) return { id: ref };
  return { id: ref.slice(0, at), version: ref.slice(at + 1) };
}

export function assertMethodRunBriefsBound(
  apparatuses: Record<string, unknown>[],
  platformTemplates: Array<{
    id: string;
    version: string;
    templateKind: string;
  }>,
): void {
  for (const entry of apparatuses) {
    const methodId = String(entry.id || "unknown");
    const ref = String(entry.run_brief_template || "");
    if (!ref) {
      throw new Error(`Method ${methodId} is missing run_brief_template`);
    }
    const { id, version } = parseRunBriefRef(ref);
    const template = platformTemplates.find((candidate) => candidate.id === id);
    if (!template || template.templateKind !== "form") {
      throw new Error(
        `Method ${methodId} run_brief_template ${ref} is not a platform Form template`,
      );
    }
    if (version && template.version !== version) {
      throw new Error(
        `Method ${methodId} run_brief_template ${ref} does not match platform version ${template.version}`,
      );
    }
  }
}

export function writeApparatusMirror(
  researchRoot: string,
  outputPath: string,
  platformCatalogPath = path.join(
    repoRoot,
    "apps",
    "web",
    "data",
    "platform-template-catalog.json",
  ),
): void {
  const artifact = buildApparatusMirror(researchRoot);
  if (!fs.existsSync(platformCatalogPath)) {
    throw new Error(
      `Platform template catalog not found at ${platformCatalogPath}. Run yarn generate:platform-templates first.`,
    );
  }
  const platformCatalog = JSON.parse(
    fs.readFileSync(platformCatalogPath, "utf8"),
  ) as {
    templates?: Array<{ id: string; version: string; templateKind: string }>;
  };
  assertMethodRunBriefsBound(
    artifact.apparatuses,
    platformCatalog.templates ?? [],
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const researchRoot =
    process.env.RESEARCH_OKF_ROOT || path.resolve(repoRoot, "../okf/research");
  const outputPath = path.join(
    repoRoot,
    "apps",
    "web",
    "data",
    "apparatuses.generated.json",
  );
  writeApparatusMirror(researchRoot, outputPath);
  console.log(
    `Generated ${path.relative(repoRoot, outputPath)} from ${path.join(researchRoot, "methods")}`,
  );
}
