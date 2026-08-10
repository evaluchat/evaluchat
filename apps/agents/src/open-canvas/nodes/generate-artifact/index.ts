import {
  createContextDocumentMessages,
  getFormattedReflections,
  getModelConfig,
  getModelFromConfig,
  isUsingO1MiniModel,
  optionallyGetSystemPromptFromConfig,
} from "../../../utils.js";
import { AIMessage } from "@langchain/core/messages";
import { ArtifactV3 } from "@opencanvas/shared/types";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../../state.js";
import { ARTIFACT_TOOL_SCHEMA } from "./schemas.js";
import { createArtifactContent, formatNewArtifactPrompt } from "./utils.js";
import { z } from "zod";

/**
 * Generate a new artifact based on the user's query.
 */
export const generateArtifact = async (
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> => {
  const { modelName } = getModelConfig(config, {
    isToolCalling: true,
  });
  const smallModel = await getModelFromConfig(config, {
    temperature: 0.5,
    isToolCalling: true,
  });

  const modelWithArtifactTool = smallModel.bindTools(
    [
      {
        name: "generate_artifact",
        description: ARTIFACT_TOOL_SCHEMA.description,
        schema: ARTIFACT_TOOL_SCHEMA,
      },
    ],
    {
      tool_choice: "generate_artifact",
    }
  );

  const memoriesAsString = await getFormattedReflections(config);
  const formattedNewArtifactPrompt = formatNewArtifactPrompt(
    memoriesAsString,
    modelName
  );

  // Add cursor context if available
  let cursorContext = "";
  if (state.cursorPosition) {
    cursorContext = `\n\nThe user's cursor is at line ${state.cursorPosition.line}, column ${state.cursorPosition.column}. The document has ${state.cursorPosition.totalLines} lines total.`;
    if (state.cursorPosition.selectedText) {
      cursorContext += `\nThe user has selected the following text:\n<selected-text>\n${state.cursorPosition.selectedText}\n</selected-text>`;
    }
  }

  const userSystemPrompt = optionallyGetSystemPromptFromConfig(config);
  const fullSystemPrompt = userSystemPrompt
    ? `${userSystemPrompt}\n${formattedNewArtifactPrompt}${cursorContext}`
    : `${formattedNewArtifactPrompt}${cursorContext}`;

  const contextDocumentMessages = await createContextDocumentMessages(config);
  const isO1MiniModel = isUsingO1MiniModel(config);
  const response = await modelWithArtifactTool.invoke(
    [
      { role: isO1MiniModel ? "user" : "system", content: fullSystemPrompt },
      ...contextDocumentMessages,
      ...state._messages,
    ],
    { runName: "generate_artifact" }
  );

  const args = response.tool_calls?.[0]?.args as
    | z.infer<typeof ARTIFACT_TOOL_SCHEMA>
    | undefined;
  if (!args) {
    throw new Error("No args found in response");
  }

  const newArtifactContent = createArtifactContent(args);
  const newArtifact: ArtifactV3 = {
    currentIndex: 1,
    contents: [newArtifactContent],
  };

  // Strip tool_calls from the history message to prevent malformed
  // message sequences on subsequent API calls. The OpenAI API requires
  // a ToolMessage immediately after an AIMessage with tool_calls, but
  // our graph adds generateFollowup (another assistant message) after
  // generateArtifact, breaking that contract.
  const cleanHistoryMessage = new AIMessage({
    content:
      typeof response.content === "string" && response.content.trim()
        ? response.content
        : `Generated ${args.type === "code" ? "code" : "artifact"}: "${args.title}".`,
    // Intentionally omit tool_calls
  });

  return {
    artifact: newArtifact,
    messages: [response], // Original with tool_calls → UI
    _messages: [cleanHistoryMessage], // Clean → future model calls
  };
};
