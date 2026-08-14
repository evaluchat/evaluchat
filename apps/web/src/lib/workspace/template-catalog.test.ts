import { describe, expect, it } from "vitest";
import {
  getTemplateById,
  getTemplateCatalog,
  isSelectableTemplate,
  searchTemplates,
} from "./template-catalog";

describe("workspace template catalog", () => {
  it("loads an immutable revision with the Getting Started template", () => {
    const catalog = getTemplateCatalog();
    expect(catalog.catalogRevision).toMatch(/^sha256:/);
    expect(getTemplateById("evaluchat-getting-started")?.title).toBe(
      "Getting Started"
    );
    expect(
      getTemplateCatalog().templates.map((template) => template.id)
    ).toEqual(["evaluchat-getting-started"]);
    expect(getTemplateById("evaluchat-assignment-brief")?.templateKind).toBe(
      "form"
    );
    expect(isSelectableTemplate("evaluchat-getting-started")).toBe(true);
    expect(isSelectableTemplate("evaluchat-assignment-brief")).toBe(false);
  });

  it("searches template id, title, and description", () => {
    expect(searchTemplates("help")).toHaveLength(1);
    expect(searchTemplates("does-not-exist")).toEqual([]);
    expect(searchTemplates("assignment")).toEqual([]);
    expect(searchTemplates("").map((template) => template.id)).toEqual([
      "evaluchat-getting-started",
    ]);
  });

  it("returns the reviewed form fields from the platform catalog snapshot", () => {
    const template = getTemplateById("evaluchat-assignment-brief");
    expect(template?.templateKind).toBe("form");
    if (template?.templateKind !== "form") return;
    expect(template.sourcePath).toBe(
      "templates/platform/evaluchat-assignment-brief.en.md"
    );
    expect(template.fields.title.maxLength).toBe(120);
    expect(template.fields.participants.type).toBe("roster");
    expect(template.layoutMarkdown).toContain("{{essay_prompt}}");
  });
});
