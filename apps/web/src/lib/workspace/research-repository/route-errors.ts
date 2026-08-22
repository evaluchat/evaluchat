import { RepositoryLayoutError } from "./layout";

export function repositoryRouteErrorDetails(
  workspaceId: string,
  error: unknown
): { workspaceId: string; code: string; message?: string } {
  if (error instanceof RepositoryLayoutError) {
    return { workspaceId, code: error.code };
  }
  return {
    workspaceId,
    code: "unknown",
    message: error instanceof Error ? error.message : "Unknown error",
  };
}
