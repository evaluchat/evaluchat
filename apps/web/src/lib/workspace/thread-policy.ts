import type { WorkspaceItem } from "./types";

export function enforceWorkspaceThreadPolicy(
  body: Record<string, any>,
  item: WorkspaceItem,
  userId: string,
  assistantId: string
): Record<string, any> {
  return {
    ...body,
    assistant_id: assistantId,
    metadata: {
      ...(body.metadata && typeof body.metadata === "object"
        ? body.metadata
        : {}),
      user_id: userId,
      workspace_item_id: item.id,
    },
    config: {
      ...(body.config && typeof body.config === "object" ? body.config : {}),
      configurable: {
        ...(body.config?.configurable &&
        typeof body.config.configurable === "object"
          ? body.config.configurable
          : {}),
        workspace_item_id: item.id,
        systemPrompt: item.templateSnapshot.assistantGuidance,
      },
    },
  };
}
