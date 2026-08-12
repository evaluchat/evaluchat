export const DEFAULT_WORKSPACE_TEMPLATE_ID = "evaluchat-getting-started";

export type WorkspaceItem = {
  id: string;
  ownerId: string;
  kind: "markdown_template" | "form_template" | "method";
  status: "active";
  createdAt: string;
  updatedAt: string;
  threadId?: string;
  source: {
    catalogRevision: string;
    templateId: typeof DEFAULT_WORKSPACE_TEMPLATE_ID;
    templateVersion: string;
    sourcePath: string;
  };
  templateSnapshot: {
    title: string;
    description: string;
    initialMarkdown: string;
    assistantGuidance: string;
    contentHash: string;
  };
};

export type WorkspaceManifest = {
  initialized: boolean;
  defaultItemId?: string;
  items: Record<string, WorkspaceItem>;
};
