import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const harness = vi.hoisted(() => ({
  rpc: vi.fn(),
  UnsupportedMethodError: class UnsupportedMethodError extends Error {},
  UnsupportedTemplateError: class UnsupportedTemplateError extends Error {},
  verifyUserAuthenticated: vi.fn(),
  createWorkspaceItem: vi.fn(),
  createMethodWorkspaceItem: vi.fn(),
  createClient: vi.fn(),
  ensureDefaultWorkspaceItem: vi.fn(),
  listWorkspaceItems: vi.fn(),
}));

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: harness.createClient,
}));
vi.mock("@/lib/workspace/store", () => ({
  UnsupportedMethodError: harness.UnsupportedMethodError,
  UnsupportedTemplateError: harness.UnsupportedTemplateError,
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
    harness.rpc.mockReset().mockResolvedValue({ error: null });
    harness.createClient.mockReset().mockResolvedValue({
      rpc: harness.rpc,
    });
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
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it("appends a BYOK share after creating a method item", async () => {
    harness.createMethodWorkspaceItem.mockResolvedValue({
      id: "wi_method",
      kind: "method",
    });

    const response = await POST(
      request({ methodId: "ai-assisted-essay", shareByok: true })
    );

    expect(response.status).toBe(201);
    expect(harness.rpc).toHaveBeenCalledTimes(1);
    expect(harness.rpc).toHaveBeenCalledWith("byok_append_share", {
      p_user_id: "user-1",
      p_item_id: "wi_method",
    });
  });

  it("appends a new item without sending existing shared item ids", async () => {
    harness.createMethodWorkspaceItem.mockResolvedValue({
      id: "wi_method",
      kind: "method",
    });

    await POST(request({ methodId: "ai-assisted-essay", shareByok: true }));

    expect(harness.rpc).toHaveBeenCalledTimes(1);
    expect(harness.rpc).toHaveBeenCalledWith("byok_append_share", {
      p_user_id: "user-1",
      p_item_id: "wi_method",
    });
  });

  it("leaves all-assignment handling to the append function", async () => {
    harness.createMethodWorkspaceItem.mockResolvedValue({
      id: "wi_method",
      kind: "method",
    });
    const response = await POST(
      request({ methodId: "ai-assisted-essay", shareByok: true })
    );

    expect(response.status).toBe(201);
    expect(harness.rpc).toHaveBeenCalledTimes(1);
  });

  it("still attempts the append when no BYOK settings row exists", async () => {
    harness.createMethodWorkspaceItem.mockResolvedValue({
      id: "wi_method",
      kind: "method",
    });

    const response = await POST(
      request({ methodId: "ai-assisted-essay", shareByok: true })
    );

    expect(response.status).toBe(201);
    expect(harness.rpc).toHaveBeenCalledTimes(1);
    expect(harness.rpc).toHaveBeenCalledWith("byok_append_share", {
      p_user_id: "user-1",
      p_item_id: "wi_method",
    });
  });

  it("creates the item when the share append RPC errors", async () => {
    harness.createMethodWorkspaceItem.mockResolvedValue({
      id: "wi_method",
      kind: "method",
    });
    harness.rpc.mockResolvedValue({ error: new Error("rpc unavailable") });

    const response = await POST(
      request({ methodId: "ai-assisted-essay", shareByok: true })
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      item: { id: "wi_method", kind: "method" },
    });
    expect(harness.rpc).toHaveBeenCalledTimes(1);
  });

  it("passes only the new item id when stale shared ids exist", async () => {
    harness.createMethodWorkspaceItem.mockResolvedValue({
      id: "wi_new",
      kind: "method",
    });

    await POST(request({ methodId: "ai-assisted-essay", shareByok: true }));

    expect(harness.rpc).toHaveBeenCalledWith("byok_append_share", {
      p_user_id: "user-1",
      p_item_id: "wi_new",
    });
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

  it("returns 400 when the store rejects with an unsupported template", async () => {
    harness.createWorkspaceItem.mockRejectedValue(
      new harness.UnsupportedTemplateError("Unsupported workspace template")
    );

    const response = await POST(request({ templateId: "starter" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Unsupported template" });
  });
});
