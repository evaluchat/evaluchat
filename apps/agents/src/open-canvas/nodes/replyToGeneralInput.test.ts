import { describe, it, expect, vi, beforeEach } from "vitest";
import { replyToGeneralInput } from "./replyToGeneralInput.js";
import {
  createMockConfig,
  createMockState,
  MockModel,
  createMockStore,
} from "../__test-helpers__/mock-config.js";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

// Mock pdf-parse to prevent file system access during testing
vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

// Mock the utils module
vi.mock("../../utils.js", () => ({
  getModelFromConfig: vi.fn(),
  ensureStoreInConfig: vi.fn(),
  formatReflections: vi.fn().mockReturnValue("No reflections found."),
  formatArtifactContentWithTemplate: vi.fn().mockReturnValue(""),
  isUsingO1MiniModel: vi.fn().mockReturnValue(false),
  optionallyGetSystemPromptFromConfig: vi.fn(),
  createContextDocumentMessages: vi.fn().mockResolvedValue([]),
}));

describe("replyToGeneralInput", () => {
  let mockModel: MockModel;
  let mockStore: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockModel = new MockModel();
    mockStore = createMockStore();

    // Configure mock responses
    mockModel.invoke.mockResolvedValue(
      new AIMessage({ content: "Mock AI response", id: "ai-response-1" })
    );

    const utils = vi.mocked(await import("../../utils.js"));
    utils.getModelFromConfig.mockResolvedValue(mockModel as any);
    utils.ensureStoreInConfig.mockReturnValue(mockStore);
    utils.optionallyGetSystemPromptFromConfig.mockReturnValue(undefined);
  });

  it("should respond to general questions with the generic assistant prompt", async () => {
    const state = createMockState({
      _messages: [new HumanMessage({ content: "General question", id: "1" })],
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining(
          "AI assistant tasked with responding to the users question"
        ),
      }),
      ...state._messages,
    ]);
  });

  it("should combine custom system prompt with the reply prompt", async () => {
    const customPrompt = "Prefer concise answers";
    const state = createMockState({
      _messages: [new HumanMessage({ content: "I need help", id: "1" })],
    });
    const config = createMockConfig({
      assistant_id: "test-123",
      systemPrompt: customPrompt,
    });

    const utils = vi.mocked(await import("../../utils.js"));
    utils.optionallyGetSystemPromptFromConfig.mockReturnValue(customPrompt);

    await replyToGeneralInput(state, config);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringMatching(
          new RegExp(
            `${customPrompt}.*AI assistant tasked with responding to the users question`,
            "s"
          )
        ),
      }),
      ...state._messages,
    ]);
  });

  it("should return the AI response in the correct format", async () => {
    const mockResponse = new AIMessage({
      content: "Here's my response",
      id: "ai-response-123",
    });
    mockModel.invoke.mockResolvedValue(mockResponse);

    const state = createMockState({
      _messages: [new HumanMessage({ content: "Help me", id: "1" })],
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    const result = await replyToGeneralInput(state, config);

    expect(result).toEqual({
      messages: [mockResponse],
      _messages: [mockResponse],
    });
  });

  it("should retrieve reflections from store", async () => {
    const state = createMockState({
      _messages: [new HumanMessage({ content: "Help me", id: "1" })],
    });
    const config = createMockConfig({ assistant_id: "test-assistant-456" });

    // Configure mock store to return reflections
    const mockReflections = {
      styleRules: ["Be concise", "Use active voice"],
      content: ["User prefers examples", "Works on long-form writing"],
    };
    mockStore.get.mockResolvedValue({ value: mockReflections });

    await replyToGeneralInput(state, config);

    // Verify store was accessed with correct parameters
    expect(mockStore.get).toHaveBeenCalledWith(
      ["memories", "test-assistant-456"],
      "reflection"
    );
  });

  it("should handle missing assistant_id in config", async () => {
    const state = createMockState({
      _messages: [new HumanMessage({ content: "Help me", id: "1" })],
    });
    const config = createMockConfig({ assistant_id: undefined });

    await expect(replyToGeneralInput(state, config)).rejects.toThrow(
      "`assistant_id` not found in configurable"
    );
  });

  it("should use user role for o1 mini model", async () => {
    const state = createMockState({
      _messages: [new HumanMessage({ content: "Help me", id: "1" })],
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    const utils = vi.mocked(await import("../../utils.js"));
    utils.isUsingO1MiniModel.mockReturnValue(true);

    await replyToGeneralInput(state, config);

    // Should use "user" role instead of "system" for o1-mini
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "user", // Not "system"
        content: expect.stringContaining(
          "AI assistant tasked with responding to the users question"
        ),
      }),
      ...state._messages,
    ]);
  });
});
