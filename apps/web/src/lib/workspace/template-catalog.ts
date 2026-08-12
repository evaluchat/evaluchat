import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import generatedCatalog from "../../../data/template-catalog.json";

const CatalogEntrySchema = z.object({
  id: z.string(),
  version: z.string(),
  locale: z.string(),
  title: z.string(),
  description: z.string(),
  templateKind: z.literal("markdown"),
  sourcePath: z.string(),
  initialMarkdown: z.string(),
  assistantGuidance: z.string(),
  contentHash: z.string(),
});

const CatalogSchema = z.object({
  schemaVersion: z.literal(1),
  catalogRevision: z.string().min(1),
  templates: z.array(CatalogEntrySchema),
});

export type TemplateCatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type TemplateCatalog = z.infer<typeof CatalogSchema>;

let lastKnownGood: TemplateCatalog | undefined;
let lastExternalRevision: string | undefined;

function parseCatalog(raw: string): TemplateCatalog {
  return CatalogSchema.parse(JSON.parse(raw));
}

function externalCatalogPath(): string | undefined {
  const configured = process.env.EVALUCHAT_TEMPLATE_CATALOG_PATH?.trim();
  if (!configured || !existsSync(configured)) return undefined;
  if (statSync(configured).isDirectory()) {
    for (const filename of ["catalog.json", "template-catalog.json"]) {
      const candidate = join(configured, filename);
      if (existsSync(candidate)) return candidate;
    }
    return undefined;
  }
  return configured;
}

function fallbackCatalog(): TemplateCatalog {
  const parsed = CatalogSchema.safeParse(generatedCatalog);
  if (!parsed.success || parsed.data.templates.length === 0) {
    throw new Error("Generated template catalog is missing or malformed");
  }
  return parsed.data;
}

/** Load the current snapshot, retaining the last good one across bad reloads. */
export function getTemplateCatalog(): TemplateCatalog {
  const path = externalCatalogPath();
  if (!path) {
    if (!lastKnownGood) lastKnownGood = fallbackCatalog();
    return lastKnownGood;
  }

  try {
    const parsed = parseCatalog(readFileSync(path, "utf8"));
    if (lastKnownGood && lastExternalRevision === parsed.catalogRevision) {
      return lastKnownGood;
    }
    lastKnownGood = parsed;
    lastExternalRevision = parsed.catalogRevision;
    return parsed;
  } catch (error) {
    console.error("[workspace] ignoring malformed template catalog", error);
    if (lastKnownGood) return lastKnownGood;
    lastKnownGood = fallbackCatalog();
    return lastKnownGood;
  }
}

export function getTemplateById(id: string): TemplateCatalogEntry | undefined {
  return getTemplateCatalog().templates.find((template) => template.id === id);
}

export function searchTemplates(query: string): TemplateCatalogEntry[] {
  const needle = query.trim().toLowerCase();
  return getTemplateCatalog()
    .templates.filter((template) => {
      if (!needle) return true;
      return [template.id, template.title, template.description].some((value) =>
        value.toLowerCase().includes(needle)
      );
    })
    .slice(0, 5);
}
