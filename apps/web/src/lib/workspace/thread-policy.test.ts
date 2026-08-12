import { describe, expect, it } from "vitest";
import { enforceWorkspaceThreadPolicy } from "./thread-policy";
import type { WorkspaceItem } from "./types";

const item: WorkspaceItem = {
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
});
