import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const harness = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  selectEq: vi.fn(),
  select: vi.fn(),
  updateEq: vi.fn(),
  update: vi.fn(),
  from: vi.fn(),
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
    harness.maybeSingle
      .mockReset()
      .mockResolvedValue({ data: null, error: null });
    harness.selectEq
      .mockReset()
      .mockReturnValue({ maybeSingle: harness.maybeSingle });
    harness.select.mockReset().mockReturnValue({ eq: harness.selectEq });
    harness.updateEq.mockReset().mockResolvedValue({ error: null });
    harness.update.mockReset().mockReturnValue({ eq: harness.updateEq });
    harness.from.mockReset().mockReturnValue({
      select: harness.select,
      update: harness.update,
    });
    harness.createClient.mockReset().mockResolvedValue({
      from: harness.from,
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
  });

  it("records a specific BYOK share after creating a method item", async () => {
    harness.createMethodWorkspaceItem.mockResolvedValue({
      id: "wi_method",
      kind: "method",
    });
    harness.maybeSingle.mockResolvedValue({
      data: {
        enabled: true,
        share_mode: "none",
        shared_item_ids: [],
      },
      error: null,
    });

    const response = await POST(
      request({ methodId: "ai-assisted-essay", shareByok: true })
    );

    expect(response.status).toBe(201);
    expect(harness.update).toHaveBeenCalledWith({
      share_mode: "specific_items",
      shared_item_ids: ["wi_method"],
      updated_at: expect.any(String),
    });
  });

  it("appends to an existing specific BYOK share without changing its mode", async () => {
    harness.createMethodWorkspaceItem.mockResolvedValue({
      id: "wi_method",
      kind: "method",
    });
    harness.maybeSingle.mockResolvedValue({
      data: {
        enabled: true,
        share_mode: "specific_items",
        shared_item_ids: ["wi_existing"],
      },
      error: null,
    });

    await POST(request({ methodId: "ai-assisted-essay", shareByok: true }));

    expect(harness.update).toHaveBeenCalledWith({
      share_mode: "specific_items",
      shared_item_ids: ["wi_existing", "wi_method"],
      updated_at: expect.any(String),
    });
  });

  it("does not override all-assignment sharing", async () => {
    harness.createMethodWorkspaceItem.mockResolvedValue({
      id: "wi_method",
      kind: "method",
    });
    harness.maybeSingle.mockResolvedValue({
      data: {
        enabled: true,
        share_mode: "all_assignments",
        shared_item_ids: [],
      },
      error: null,
    });

    const response = await POST(
      request({ methodId: "ai-assisted-essay", shareByok: true })
    );

    expect(response.status).toBe(201);
    expect(harness.update).not.toHaveBeenCalled();
  });

  it("creates the item without sharing when no BYOK settings row exists", async () => {
    harness.createMethodWorkspaceItem.mockResolvedValue({
      id: "wi_method",
      kind: "method",
    });

    const response = await POST(
      request({ methodId: "ai-assisted-essay", shareByok: true })
    );

    expect(response.status).toBe(201);
    expect(harness.update).not.toHaveBeenCalled();
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
