import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return {
    verifyUserAuthenticated: vi.fn(),
    listWorkspaceItems: vi.fn(),
    getWorkspaceItem: vi.fn(),
    createAdminClient: vi.fn(() => ({
      from: vi.fn(() => ({ select })),
    })),
    maybeSingle,
  };
});

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/store", () => ({
  getWorkspaceItem: harness.getWorkspaceItem,
  listWorkspaceItems: harness.listWorkspaceItems,
}));
vi.mock("@/lib/teaching/admin-client", () => ({
  createAdminClient: harness.createAdminClient,
}));

import { GET } from "./route";

describe("GET /api/byok/shared", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset().mockResolvedValue({
      user: { id: "student-1", email: "student@example.com" },
    });
    harness.listWorkspaceItems.mockReset().mockResolvedValue([]);
    harness.getWorkspaceItem.mockReset();
    harness.maybeSingle.mockReset();
  });

  it("returns an empty array for a non-participant", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(harness.createAdminClient).not.toHaveBeenCalled();
  });

  it("returns only a safe provider label for an actively shared participant", async () => {
    harness.listWorkspaceItems.mockResolvedValue([
      {
        id: "participant-item",
        ownerId: "student-1",
        kind: "method_participant",
        operatorId: "instructor-1",
        operatorItemId: "method-item",
      },
    ]);
    harness.getWorkspaceItem.mockResolvedValue({
      id: "method-item",
      ownerId: "instructor-1",
      kind: "method",
      run: {
        participants: [
          {
            itemId: "participant-item",
            userId: "student-1",
            email: "student@example.com",
          },
        ],
      },
    });
    harness.maybeSingle.mockResolvedValue({
      data: {
        user_id: "instructor-1",
        base_url: "https://private.example/v1",
        model: "openai/gpt-4o-mini",
        api_key_enc: "encrypted-secret",
        enabled: true,
        share_mode: "all_assignments",
        shared_item_ids: [],
      },
      error: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(body).toEqual([
      {
        itemId: "participant-item",
        providerLabel: "Provided by instructor — openai/gpt-4o-mini",
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("encrypted-secret");
    expect(JSON.stringify(body)).not.toContain("private.example");
  });
});
