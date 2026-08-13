export const DEFAULT_WORKSPACE_TEMPLATE_ID = "evaluchat-getting-started";

export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "roster";

export type FormFieldDefinition = {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  maxLength?: number;
  displayChars?: number;
  displayLines?: number;
  options?: string[];
  min?: number;
  max?: number;
  minDate?: string;
  maxDate?: string;
};

export type FormValue = string | number | string[];

export type MarkdownTemplateSnapshot = {
  kind: "markdown";
  title: string;
  description: string;
  initialMarkdown: string;
  assistantGuidance: string;
  contentHash: string;
};

export type FormTemplateSnapshot = {
  kind: "form";
  templateId: string;
  templateVersion: string;
  catalogRevision: string;
  contentHash: string;
  title: string;
  description: string;
  assistantGuidance: string;
  layoutMarkdown: string;
  fields: Record<string, FormFieldDefinition>;
};

export type SubmittedForm = {
  status: "submitted";
  values: Record<string, FormValue>;
  resolvedMarkdown: string;
  submittedAt: string;
};

type WorkspaceItemBase = {
  id: string;
  ownerId: string;
  status: "active";
  createdAt: string;
  updatedAt: string;
  source: {
    catalogRevision: string;
    templateId: string;
    templateVersion: string;
    sourcePath: string;
  };
};

export type MarkdownWorkspaceItem = WorkspaceItemBase & {
  kind: "markdown_template";
  threadId?: string;
  templateSnapshot: MarkdownTemplateSnapshot;
};

export type FormWorkspaceItem = WorkspaceItemBase & {
  kind: "form_template";
  threadId?: string;
  templateSnapshot: FormTemplateSnapshot;
  submission?: SubmittedForm;
};

export type MethodWorkspaceItem = WorkspaceItemBase & {
  kind: "method";
  templateSnapshot: MarkdownTemplateSnapshot;
};

export type WorkspaceItem =
  | MarkdownWorkspaceItem
  | FormWorkspaceItem
  | MethodWorkspaceItem;

export type WorkspaceManifest = {
  initialized: boolean;
  defaultItemId?: string;
  items: Record<string, WorkspaceItem>;
};
