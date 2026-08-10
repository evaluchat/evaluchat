/**
 * Integration test: verify generatePath routes mechanical text edits correctly.
 */
import { describe, it, expect, vi } from "vitest";
import { HumanMessage } from "@langchain/core/messages";

vi.mock("../../utils.js", () => ({
  getModelConfig: () => ({ modelProvider: "openai", modelName: "gpt-4o" }),
  getModelFromConfig: async () => ({
    invoke: async () => ({ content: "dummy" }),
    withConfig: () => ({ invoke: async () => ({ content: "dummy" }) }),
  }),
  createContextDocumentMessages: async () => [],
  isUsingO1MiniModel: () => false,
  optionallyGetSystemPromptFromConfig: () => null,
  getFormattedReflections: async () => "",
  getStringFromContent: (c: any) => (typeof c === "string" ? c : ""),
}));

vi.mock("../../nodes/generate-path/dynamic-determine-path.js", () => ({
  dynamicDeterminePath: async () => ({ route: "generateArtifact" }),
}));

vi.mock("../../nodes/generate-path/documents.js", () => ({
  convertContextDocumentToHumanMessage: async () => null,
  fixMisFormattedContextDocMessage: async () => null,
}));

vi.mock("pdf-parse", () => ({ default: async () => ({ text: "" }) }));

vi.mock("../../nodes/generate-path/include-url-contents.js", () => ({
  includeURLContents: async () => null,
}));

vi.mock("@opencanvas/shared/utils/urls.js", () => ({
  extractUrls: () => [],
}));

import { generatePath } from "../../nodes/generate-path/index.js";

function makeState(overrides: any = {}) {
  return {
    _messages: [
      new HumanMessage("Replace all instances of CAIMLD with CAMDLE"),
    ],
    artifact: overrides.artifact || undefined,
    ...overrides,
  } as any;
}

describe("generatePath routing for 'replace all'", () => {
  it("routes to applyTextEdits when multiple artifact contents exist", async () => {
    const state = makeState({
      artifact: {
        currentIndex: 2,
        contents: [
          { index: 1, type: "text", fullMarkdown: "CAIMLD is great." },
          { index: 2, type: "text", fullMarkdown: "CAIMLD is awesome." },
        ],
      },
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("applyTextEdits");
    expect(result.textEditIntent).toEqual({
      kind: "replace_all",
      find: "CAIMLD",
      replace: "CAMDLE",
      matchCase: true,
    });
  });

  it("routes to applyTextEdits when single artifact content exists", async () => {
    const state = makeState({
      artifact: {
        currentIndex: 1,
        contents: [
          { index: 1, type: "text", fullMarkdown: "CAIMLD is great." },
        ],
      },
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("applyTextEdits");
  });

  it("does not route to applyTextEdits when no artifact exists", async () => {
    const state = makeState({
      artifact: undefined,
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("generateArtifact");
  });

  it("routes to applyTextEdits regardless of other state", async () => {
    const state = makeState({
      artifact: {
        currentIndex: 1,
        contents: [
          { index: 1, type: "text", fullMarkdown: "CAIMLD is great." },
        ],
      },
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("applyTextEdits");
  });

  it("routes via dynamicDeterminePath when message is not a replace-all intent", async () => {
    const state = makeState({
      _messages: [new HumanMessage("What do you think about CAIMLD?")],
      artifact: {
        currentIndex: 1,
        contents: [
          { index: 1, type: "text", fullMarkdown: "CAIMLD is great." },
        ],
      },
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("generateArtifact");
  });
});

describe("generatePath routing for selection literal replace", () => {
  it("routes literal selection replace to applyTextEdits", async () => {
    const state = makeState({
      _messages: [new HumanMessage("Change brown to red")],
      highlightedText: {
        fullMarkdown: "The quick brown fox",
        markdownBlock: "The quick brown fox",
        selectedText: "brown",
      },
      artifact: {
        currentIndex: 1,
        contents: [
          { index: 1, type: "text", fullMarkdown: "The quick brown fox" },
        ],
      },
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("applyTextEdits");
    expect(result.textEditIntent).toEqual({
      kind: "replace_in_selection",
      find: "brown",
      replace: "red",
      replaceAllInBlock: false,
    });
  });

  it("routes paraphrase selection edits to updateHighlightedText", async () => {
    const state = makeState({
      _messages: [new HumanMessage("Make this sound more formal")],
      highlightedText: {
        fullMarkdown: "The quick brown fox",
        markdownBlock: "The quick brown fox",
        selectedText: "brown",
      },
      artifact: {
        currentIndex: 1,
        contents: [
          { index: 1, type: "text", fullMarkdown: "The quick brown fox" },
        ],
      },
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("updateHighlightedText");
  });

  it("routes selection questions to replyToGeneralInput, not updateHighlightedText", async () => {
    const state = makeState({
      _messages: [
        new HumanMessage(
          'We moved this section down - which was previously in the introduction - does it work under the head "Strategic dissemination and support structure"?'
        ),
      ],
      highlightedText: {
        fullMarkdown: "## Strategic dissemination\n\nSome content.",
        markdownBlock: "## Strategic dissemination\n\nSome content.",
        selectedText: "Strategic dissemination",
      },
      artifact: {
        currentIndex: 1,
        contents: [
          {
            index: 1,
            type: "text",
            fullMarkdown: "## Strategic dissemination\n\nSome content.",
          },
        ],
      },
    });

    const result = await generatePath(state, {} as any);
    expect(result.next).toBe("replyToGeneralInput");
  });
});
