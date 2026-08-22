import { describe, expect, it } from "vitest";
import { repositoryRouteErrorDetails } from "./route-errors";

describe("repository route error details", () => {
  it("redacts messages from unknown errors", () => {
    const details = repositoryRouteErrorDetails(
      "workspace-one",
      new Error("failed at research/private-notes.md")
    );

    expect(details).toEqual({
      workspaceId: "workspace-one",
      code: "unknown",
      name: "Error",
    });
    expect(details).not.toHaveProperty("message");
  });

  it("uses a stable name for non-Error values", () => {
    expect(
      repositoryRouteErrorDetails("workspace-one", "private/path")
    ).toEqual({
      workspaceId: "workspace-one",
      code: "unknown",
      name: "UnknownError",
    });
  });
});
