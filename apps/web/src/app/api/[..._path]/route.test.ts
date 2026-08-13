import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const harness = vi.hoisted(() => ({
  verifyUserAuthenticated: vi.fn(),
  getWorkspaceItem: vi.fn(),
  getCustomAssignmentById: vi.fn(),
  getSeedAssignmentById: vi.fn(),
}));

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/store", () => ({
  getWorkspaceItem: harness.getWorkspaceItem,
}));
vi.mock("@/lib/teaching/assignment-file-store", () => ({
  getCustomAssignmentById: harness.getCustomAssignmentById,
}));
vi.mock("@/lib/teaching/seed-loader", () => ({
  getSeedAssignmentById: harness.getSeedAssignmentById,
}));

import { POST } from "./route";

const THREAD_ID = "thread-owned";
const THREAD_URL = `http://localhost:54367/threads/${THREAD_ID}`;
const RUNS_URL = `${THREAD_URL}/runs`;

function runRequest(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/threads/${THREAD_ID}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/threads/{id}/runs workspace policy", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.getWorkspaceItem.mockReset();
    harness.getCustomAssignmentById.mockReset();
    harness.getSeedAssignmentById.mockReset();
    harness.verifyUserAuthenticated.mockResolvedValue({
      session: { access_token: "tok" },
      user: { id: "user-1" },
    });
    harness.getCustomAssignmentById.mockResolvedValue(undefined);
    harness.getSeedAssignmentById.mockResolvedValue(undefined);
    harness.getWorkspaceItem.mockResolvedValue({
      id: "wi_owned",
      ownerId: "user-1",
      kind: "markdown_template",
      templateSnapshot: { assistantGuidance: "trusted guidance" },
    });
    vi.unstubAllGlobals();
  });

  it("fails closed when the workspace metadata re-fetch fails", async () => {
    let threadGets = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === THREAD_URL) {
        threadGets += 1;
        if (threadGets <= 2) {
          return jsonResponse(200, {
            metadata: {
              user_id: "user-1",
              workspace_item_id: "wi_owned",
            },
          });
        }
        return jsonResponse(503, { error: "unavailable" });
      }
      if (url === RUNS_URL) {
        return jsonResponse(200, { ok: true });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      runRequest({
        assistant_id: "forged-assistant",
        config: { configurable: { systemPrompt: "forged guidance" } },
      })
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Could not resolve workspace item",
    });
    expect(
      fetchMock.mock.calls.some(([input]) => String(input) === RUNS_URL)
    ).toBe(false);
  });
});
