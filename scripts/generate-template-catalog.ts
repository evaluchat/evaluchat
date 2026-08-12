#!/usr/bin/env tsx

/**
 * Build the immutable Markdown-template snapshot consumed by the web app.
 *
 * Usage:
 *   EVALUCHAT_TEMPLATE_SOURCE_ROOT=/path/to/knowledge-catalog/templates \
 *     yarn generate:templates
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { z } from "zod";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceRootValue = process.env.EVALUCHAT_TEMPLATE_SOURCE_ROOT?.trim();
if (!sourceRootValue) {
  throw new Error(
    "EVALUCHAT_TEMPLATE_SOURCE_ROOT is required; generate from evaluchat/knowledge@dev",
  );
}
const sourceRoot = path.resolve(sourceRootValue);
const outputPath = path.resolve(
  process.env.EVALUCHAT_TEMPLATE_CATALOG_OUTPUT ||
    path.join(repoRoot, "apps/web/data/template-catalog.json"),
);

const semver = /^\d+\.\d+\.\d+$/;
const TemplateFrontmatter = z
  .object({
    type: z.literal("Markdown Template"),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    version: z.string().regex(semver),
    locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
    title: z.string().min(1),
    description: z.string().min(1),
    template_kind: z.literal("markdown"),
    assistant: z.object({ guidance: z.string().min(1) }),
  })
  .passthrough();

type CatalogEntry = {
  id: string;
  version: string;
  locale: string;
  title: string;
  description: string;
  templateKind: "markdown";
  sourcePath: string;
  initialMarkdown: string;
  assistantGuidance: string;
  contentHash: string;
};

function hash(value: string): string {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function parseTemplate(sourcePath: string): CatalogEntry {
  const source = fs.readFileSync(sourcePath, "utf8");
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`Template has no YAML frontmatter: ${sourcePath}`);
  }

  const frontmatter = TemplateFrontmatter.parse(yaml.load(match[1]));
  const initialMarkdown = match[2].trim();
  if (!initialMarkdown) {
    throw new Error(`Template body is empty: ${sourcePath}`);
  }

  return {
    id: frontmatter.id,
    version: frontmatter.version,
    locale: frontmatter.locale,
    title: frontmatter.title,
    description: frontmatter.description,
    templateKind: "markdown",
    sourcePath: `templates/${path.basename(sourcePath)}`,
    initialMarkdown: `${initialMarkdown}\n`,
    assistantGuidance: frontmatter.assistant.guidance.trim(),
    contentHash: hash(source),
  };
}

if (!fs.existsSync(sourceRoot)) {
  throw new Error(`Template source directory not found: ${sourceRoot}`);
}

const entries = fs
  .readdirSync(sourceRoot)
  .filter((filename) => filename.endsWith(".md"))
  .sort()
  .map((filename) => parseTemplate(path.join(sourceRoot, filename)));

if (!entries.length) {
  throw new Error(`No Markdown templates found in ${sourceRoot}`);
}

const ids = new Set<string>();
for (const entry of entries) {
  if (ids.has(entry.id)) throw new Error(`Duplicate template id: ${entry.id}`);
  ids.add(entry.id);
}

const canonical = JSON.stringify(entries);
const artifact = {
  schemaVersion: 1,
  catalogRevision: hash(canonical),
  templates: entries,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(
  `Generated ${path.relative(repoRoot, outputPath)} from ${sourceRoot}`,
);
