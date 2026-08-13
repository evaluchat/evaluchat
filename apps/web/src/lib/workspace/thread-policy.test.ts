import { describe, expect, it } from "vitest";
import {
  enforceWorkspaceThreadPolicy,
  supportsWorkspaceThreads,
} from "./thread-policy";
import type { FormWorkspaceItem, MarkdownWorkspaceItem } from "./types";

const item: MarkdownWorkspaceItem = {
  id: "wi_owned",
  ownerId: "user_owned",
  kind: "markdown_template",
  status: "active",
  createdAt: "2026-08-12T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z",
  source: {
    catalogRevision: "sha256:catalog",
    templateId: "evaluchat-getting-started",
    templateVersion: "1.0.0",
    sourcePath: "templates/evaluchat-getting-started.en.md",
  },
  templateSnapshot: {
    kind: "markdown",
    title: "Getting Started",
    description: "Description",
    initialMarkdown: "# Start\n",
    assistantGuidance: "trusted guidance",
    contentHash: "sha256:content",
  },
};

describe("enforceWorkspaceThreadPolicy", () => {
  it("overwrites forged assistant and system guidance", () => {
    const result = enforceWorkspaceThreadPolicy(
      {
        assistant_id: "forged-assistant",
        metadata: { workspace_item_id: "forged-item", user_id: "forged-user" },
        config: { configurable: { systemPrompt: "forged guidance" } },
      },
      item,
      "user_owned",
      "platform-assistant"
    );

    expect(result.assistant_id).toBe("platform-assistant");
    expect(result.metadata).toEqual({
      workspace_item_id: "wi_owned",
      user_id: "user_owned",
    });
    expect(result.config.configurable.systemPrompt).toBe("trusted guidance");
  });

  it("allows assistant threads for Form workspace items", () => {
    const formItem: FormWorkspaceItem = {
      ...item,
      kind: "form_template",
      templateSnapshot: {
        kind: "form",
        templateId: "assignment-brief",
        templateVersion: "1.0.0",
        catalogRevision: "sha256:catalog",
        contentHash: "sha256:content",
        title: "Assignment brief",
        description: "Description",
        assistantGuidance: "trusted guidance",
        layoutMarkdown: "# {{title}}",
        fields: {
          title: {
            id: "title",
            label: "Title",
            type: "text",
            required: true,
          },
        },
      },
    };

    expect(supportsWorkspaceThreads(formItem)).toBe(true);
    expect(
      enforceWorkspaceThreadPolicy(
        { metadata: {}, config: { configurable: {} } },
        formItem,
        "user_owned",
        "platform-assistant"
      ).config.configurable.systemPrompt
    ).toBe("trusted guidance");
  });
});
