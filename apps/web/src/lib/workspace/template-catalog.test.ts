import { describe, expect, it } from "vitest";
import {
  getTemplateById,
  getTemplateCatalog,
  searchTemplates,
} from "./template-catalog";

describe("workspace template catalog", () => {
  it("loads an immutable revision with the Getting Started template", () => {
    const catalog = getTemplateCatalog();
    expect(catalog.catalogRevision).toMatch(/^sha256:/);
    expect(getTemplateById("evaluchat-getting-started")?.title).toBe(
      "Getting Started"
    );
  });

  it("searches template id, title, and description", () => {
    expect(searchTemplates("help")).toHaveLength(1);
    expect(searchTemplates("does-not-exist")).toEqual([]);
  });
});
