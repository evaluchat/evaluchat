import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  class WorkspaceItemNotFoundError extends Error {}
  class WorkspaceThreadOwnershipError extends Error {}

  return {
    verifyUserAuthenticated: vi.fn(),
    deleteWorkspaceItem: vi.fn(),
    WorkspaceItemNotFoundError,
    WorkspaceThreadOwnershipError,
  };
});

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/store", () => ({
  deleteWorkspaceItem: harness.deleteWorkspaceItem,
  getWorkspaceItem: vi.fn(),
  reconcileWorkspaceItemThread: vi.fn(),
  WorkspaceItemNotFoundError: harness.WorkspaceItemNotFoundError,
  WorkspaceThreadOwnershipError: harness.WorkspaceThreadOwnershipError,
}));

import { DELETE } from "./route";

const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe("DELETE /api/workspace/items/[id]", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.deleteWorkspaceItem.mockReset();
  });

  it("rejects unauthenticated deletion", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue(undefined);

    const response = await DELETE(
      new Request("http://localhost"),
      context("wi_1")
    );

    expect(response.status).toBe(401);
    expect(harness.deleteWorkspaceItem).not.toHaveBeenCalled();
  });

  it("deletes an owned item with a 204 response", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });

    const response = await DELETE(
      new Request("http://localhost"),
      context("wi_1")
    );

    expect(response.status).toBe(204);
    expect(harness.deleteWorkspaceItem).toHaveBeenCalledWith("user-1", "wi_1");
  });

  it("returns not found without leaking ownership", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.deleteWorkspaceItem.mockRejectedValue(
      new harness.WorkspaceItemNotFoundError()
    );

    const response = await DELETE(
      new Request("http://localhost"),
      context("wi_1")
    );

    expect(response.status).toBe(404);
  });

  it("returns forbidden when the attached thread is not owned", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.deleteWorkspaceItem.mockRejectedValue(
      new harness.WorkspaceThreadOwnershipError()
    );

    const response = await DELETE(
      new Request("http://localhost"),
      context("wi_1")
    );

    expect(response.status).toBe(403);
  });
});
