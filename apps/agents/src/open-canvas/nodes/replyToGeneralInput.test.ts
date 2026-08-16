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

  it("should include socratic phase instructions when phase_state is socratic", async () => {
    const state = createMockState({
      phase_state: "socratic",
      _messages: [
        new HumanMessage({ content: "Help me with my thesis", id: "1" }),
      ],
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    // Check that the model was called with socratic instructions
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("Current phase: Socratic"),
      }),
      ...state._messages,
    ]);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("NEVER blocked from using the canvas"),
      }),
      ...state._messages,
    ]);
  });

  it("should include drafting phase instructions when phase_state is drafting", async () => {
    const state = createMockState({
      phase_state: "drafting",
      _messages: [
        new HumanMessage({ content: "Help me write my introduction", id: "1" }),
      ],
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    // Check that the model was called with drafting instructions
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("Current phase: Drafting"),
      }),
      ...state._messages,
    ]);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("Collaborative review"),
      }),
      ...state._messages,
    ]);
  });

  it("should include submitted phase instructions when phase_state is submitted", async () => {
    const state = createMockState({
      phase_state: "submitted",
      _messages: [new HumanMessage({ content: "How did I do?", id: "1" })],
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("Current phase: Submitted"),
      }),
      ...state._messages,
    ]);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("assignment is complete"),
      }),
      ...state._messages,
    ]);
  });

  it("should default to socratic phase when phase_state is undefined", async () => {
    const state = createMockState({
      phase_state: undefined, // No phase set
      _messages: [new HumanMessage({ content: "General question", id: "1" })],
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    // Should default to socratic behavior
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("Current phase: Socratic"),
      }),
      ...state._messages,
    ]);
  });

  it("should combine assignment system prompt with phase instructions", async () => {
    const assignmentPrompt = "Write a 5-paragraph essay about Romeo and Juliet";
    const state = createMockState({
      phase_state: "socratic",
      _messages: [new HumanMessage({ content: "I need help", id: "1" })],
    });
    const config = createMockConfig({
      assistant_id: "test-123",
      systemPrompt: assignmentPrompt,
    });

    const utils = vi.mocked(await import("../../utils.js"));
    utils.optionallyGetSystemPromptFromConfig.mockReturnValue(assignmentPrompt);

    await replyToGeneralInput(state, config);

    // Should include both the assignment prompt and phase instructions
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "system",
        content: expect.stringMatching(
          new RegExp(`${assignmentPrompt}.*Current phase: Socratic`, "s")
        ),
      }),
      ...state._messages,
    ]);
  });

  it("should return the AI response in the correct format", async () => {
    const mockResponse = new AIMessage({
      content: "Here's my coaching response",
      id: "ai-response-123",
    });
    mockModel.invoke.mockResolvedValue(mockResponse);

    const state = createMockState({
      phase_state: "socratic",
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
      phase_state: "socratic",
      _messages: [new HumanMessage({ content: "Help me", id: "1" })],
    });
    const config = createMockConfig({ assistant_id: "test-assistant-456" });

    // Configure mock store to return reflections
    const mockReflections = {
      styleRules: ["Be concise", "Use active voice"],
      content: ["Student prefers examples", "Struggles with thesis statements"],
    };
    mockStore.get.mockResolvedValue({ value: mockReflections });

    await replyToGeneralInput(state, config);

    // Verify store was accessed with correct parameters
    expect(mockStore.get).toHaveBeenCalledWith(
      ["memories", "anonymous", "test-assistant-456"],
      "reflection"
    );
  });

  it("should handle missing assistant_id in config", async () => {
    const state = createMockState({
      phase_state: "socratic",
      _messages: [new HumanMessage({ content: "Help me", id: "1" })],
    });
    const config = createMockConfig({ assistant_id: undefined });

    await expect(replyToGeneralInput(state, config)).rejects.toThrow(
      "`assistant_id` not found in configurable"
    );
  });

  it("should use user role for o1 mini model", async () => {
    const state = createMockState({
      phase_state: "socratic",
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
        content: expect.stringContaining("Current phase: Socratic"),
      }),
      ...state._messages,
    ]);
  });

  it("includes the structured form context and update protocol", async () => {
    const state = createMockState({
      _messages: [new HumanMessage({ content: "Set the title", id: "1" })],
      formContext: {
        templateId: "assignment-brief",
        title: "Assignment brief",
        description: "A brief for an assignment",
        layoutMarkdown: "# {{title}}",
        fields: {
          title: { label: "Title", type: "text", required: true },
        },
        values: { title: "Old title" },
      },
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining("<form-context>"),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining('"title": "Old title"'),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining("<form-updates>"),
      }),
      ...state._messages,
    ]);
  });

  it("orients Method brief chats to the assignment initiator", async () => {
    const state = createMockState({
      _messages: [new HumanMessage({ content: "Review the brief", id: "1" })],
      formContext: {
        templateId: "assignment-brief",
        title: "Assignment brief",
        description: "A brief for an assignment",
        layoutMarkdown: "# {{title}}",
        fields: {},
        values: {},
        methodContext: {
          title: "AI-assisted essay",
          description: "Constrained dialogic drafting.",
          guidance: "Keep the assignment open to student interpretation.",
          briefTemplate: "# {{title}}",
        },
      },
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining(
          "You are assisting the person creating and initiating this assignment"
        ),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining(
          '"guidance": "Keep the assignment open to student interpretation."'
        ),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining(
          "This initiator orientation overrides the generic AI writing coach"
        ),
      }),
      ...state._messages,
    ]);
  });

  it("does not add Method initiator orientation without Method context", async () => {
    const state = createMockState({
      _messages: [new HumanMessage({ content: "Set the title", id: "1" })],
      formContext: {
        templateId: "assignment-brief",
        title: "Assignment brief",
        description: "A brief for an assignment",
        layoutMarkdown: "# {{title}}",
        fields: {},
        values: {},
      },
    });
    const config = createMockConfig({ assistant_id: "test-123" });

    await replyToGeneralInput(state, config);

    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.stringContaining(
          "You are an AI writing coach helping a student"
        ),
      }),
      ...state._messages,
    ]);
    expect(mockModel.invoke).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.not.stringContaining("<method-context>"),
      }),
      ...state._messages,
    ]);
  });
});
