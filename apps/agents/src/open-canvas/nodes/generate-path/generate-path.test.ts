import { describe, it, expect, vi, beforeEach } from "vitest";
import { generatePath } from "./index.js";
import {
  createMockConfig,
  createMockState,
} from "../../__test-helpers__/mock-config.js";
import { HumanMessage } from "@langchain/core/messages";

// Mock pdf-parse to prevent file system access during testing
vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

// Mock the dynamic-determine-path module
vi.mock("./dynamic-determine-path.js", () => ({
  dynamicDeterminePath: vi
    .fn()
    .mockResolvedValue({ route: "generateArtifact" }),
}));

// Mock other dependencies
vi.mock("./documents.js", () => ({
  convertContextDocumentToHumanMessage: vi.fn().mockResolvedValue(null),
  fixMisFormattedContextDocMessage: vi.fn().mockResolvedValue(null),
}));

vi.mock("./include-url-contents.js", () => ({
  includeURLContents: vi.fn().mockResolvedValue(undefined),
}));

describe("generatePath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should honor explicit next route when provided", async () => {
    const state = createMockState({
      next: "replyToGeneralInput",
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    expect(result).toEqual({
      next: "replyToGeneralInput",
    });
  });

  it("should route to updateArtifact when highlightedCode is set", async () => {
    const state = createMockState({
      highlightedCode: {
        startCharIndex: 0,
        endCharIndex: 20,
      },
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    expect(result.next).toBe("updateArtifact");
  });

  it("should route to updateHighlightedText when highlightedText is set with edit intent", async () => {
    const state = createMockState({
      _messages: [
        new HumanMessage({
          content: "Rewrite this paragraph to be clearer",
          id: "test-msg-1",
        }),
      ],
      highlightedText: {
        fullMarkdown: "Selected text",
        markdownBlock: "Selected text",
        selectedText: "Selected text",
      },
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    expect(result.next).toBe("updateHighlightedText");
  });

  it("should route to replyToGeneralInput when highlightedText is set but message is a question", async () => {
    const state = createMockState({
      _messages: [
        new HumanMessage({
          content: "Does this section fit here?",
          id: "test-msg-1",
        }),
      ],
      highlightedText: {
        fullMarkdown: "Selected text",
        markdownBlock: "Selected text",
        selectedText: "Selected text",
      },
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    expect(result.next).toBe("replyToGeneralInput");
  });

  it("should route to rewriteArtifactTheme when theme options are set", async () => {
    const state = createMockState({
      language: "spanish",
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    expect(result.next).toBe("rewriteArtifactTheme");
  });

  it("should route to rewriteCodeArtifactTheme when code options are set", async () => {
    const state = createMockState({
      addComments: true,
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    expect(result.next).toBe("rewriteCodeArtifactTheme");
  });

  it("should route to customAction when customQuickActionId is set", async () => {
    const state = createMockState({
      customQuickActionId: "test-action-123",
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    expect(result.next).toBe("customAction");
  });

  it("should route to webSearch when webSearchEnabled is true", async () => {
    const state = createMockState({
      webSearchEnabled: true,
    });
    const config = createMockConfig();

    const result = await generatePath(state, config);

    expect(result.next).toBe("webSearch");
  });
});
