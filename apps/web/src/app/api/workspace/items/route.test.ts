import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const harness = vi.hoisted(() => ({
  UnsupportedMethodError: class UnsupportedMethodError extends Error {},
  verifyUserAuthenticated: vi.fn(),
  createWorkspaceItem: vi.fn(),
  createMethodWorkspaceItem: vi.fn(),
  ensureDefaultWorkspaceItem: vi.fn(),
  listWorkspaceItems: vi.fn(),
}));

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/store", () => ({
  UnsupportedMethodError: harness.UnsupportedMethodError,
  createWorkspaceItem: harness.createWorkspaceItem,
  createMethodWorkspaceItem: harness.createMethodWorkspaceItem,
  ensureDefaultWorkspaceItem: harness.ensureDefaultWorkspaceItem,
  listWorkspaceItems: harness.listWorkspaceItems,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/workspace/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function malformedRequest() {
  return new NextRequest("http://localhost/api/workspace/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
}

describe("POST /api/workspace/items", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.createWorkspaceItem.mockReset();
    harness.createMethodWorkspaceItem.mockReset();
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
  });

  it("creates a method draft from methodId", async () => {
    harness.createMethodWorkspaceItem.mockResolvedValue({
      id: "wi_method",
      kind: "method",
    });
    const response = await POST(request({ methodId: "ai-assisted-essay" }));
    expect(response.status).toBe(201);
    expect(harness.createMethodWorkspaceItem).toHaveBeenCalledWith(
      "user-1",
      "ai-assisted-essay"
    );
    expect(harness.createWorkspaceItem).not.toHaveBeenCalled();
  });

  it("rejects an empty body", async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(400);
    expect(harness.createMethodWorkspaceItem).not.toHaveBeenCalled();
    expect(harness.createWorkspaceItem).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without calling the store", async () => {
    const response = await POST(malformedRequest());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request body" });
    expect(harness.createMethodWorkspaceItem).not.toHaveBeenCalled();
    expect(harness.createWorkspaceItem).not.toHaveBeenCalled();
  });

  it("returns 500 when the store rejects with an unexpected error", async () => {
    harness.createWorkspaceItem.mockRejectedValue(new Error("disk full"));

    const response = await POST(request({ templateId: "starter" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Could not create workspace item",
    });
  });
});
