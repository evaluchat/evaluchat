import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const harness = vi.hoisted(() => ({
  verifyUserAuthenticated: vi.fn(),
  listApparatuses: vi.fn(),
  searchTemplates: vi.fn(),
}));

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/apparatuses/registry", () => ({
  listApparatuses: harness.listApparatuses,
}));
vi.mock("@/lib/workspace/template-catalog", () => ({
  searchTemplates: harness.searchTemplates,
}));

import { GET } from "./route";

describe("GET /api/workspace/catalog", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.listApparatuses.mockReset();
    harness.searchTemplates.mockReset();
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.listApparatuses.mockReturnValue([
      {
        id: "ai-assisted-essay",
        name: "AI-assisted essay",
        description: "Constrained dialogic drafting",
      },
    ]);
    harness.searchTemplates.mockReturnValue([]);
  });

  it("returns selectable methods without an under-construction status", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/workspace/catalog?kind=method")
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: "method",
      results: [
        {
          id: "ai-assisted-essay",
          title: "AI-assisted essay",
          description: "Constrained dialogic drafting",
          disabled: false,
        },
      ],
    });
  });
});
