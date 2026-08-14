import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const harness = vi.hoisted(() => {
  class WorkspaceItemNotFoundError extends Error {}
  class FormValidationError extends Error {
    issues = [{ fieldId: "title", message: "Title is required." }];
  }
  class WorkspaceFormAlreadySubmittedError extends Error {}
  return {
    verifyUserAuthenticated: vi.fn(),
    submitWorkspaceForm: vi.fn(),
    WorkspaceItemNotFoundError,
    FormValidationError,
    WorkspaceFormAlreadySubmittedError,
  };
});

vi.mock("@/lib/supabase/verify_user_server", () => ({
  verifyUserAuthenticated: harness.verifyUserAuthenticated,
}));
vi.mock("@/lib/workspace/store", () => ({
  submitWorkspaceForm: harness.submitWorkspaceForm,
  WorkspaceItemNotFoundError: harness.WorkspaceItemNotFoundError,
  WorkspaceFormAlreadySubmittedError:
    harness.WorkspaceFormAlreadySubmittedError,
}));
vi.mock("@/lib/workspace/form-validation", () => ({
  FormValidationError: harness.FormValidationError,
}));

import { POST } from "./route";

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (values: unknown) =>
  new NextRequest("http://localhost/api/workspace/items/wi_1/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values }),
  });

describe("POST /api/workspace/items/[id]/submit", () => {
  beforeEach(() => {
    harness.verifyUserAuthenticated.mockReset();
    harness.submitWorkspaceForm.mockReset();
  });

  it("requires authentication", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue(undefined);
    const response = await POST(request({}), context("wi_1"));
    expect(response.status).toBe(401);
    expect(harness.submitWorkspaceForm).not.toHaveBeenCalled();
  });

  it("submits an owned form and exposes the idempotency result", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.submitWorkspaceForm.mockResolvedValue({
      item: {
        id: "wi_1",
        kind: "form_template",
        submission: { status: "submitted" },
      },
      idempotent: false,
    });
    const response = await POST(request({ title: "Brief" }), context("wi_1"));
    expect(response.status).toBe(201);
    expect(harness.submitWorkspaceForm).toHaveBeenCalledWith(
      "user-1",
      "wi_1",
      {
        title: "Brief",
      },
      {
        profileId: undefined,
        threadId: undefined,
      }
    );
    expect(await response.json()).toMatchObject({ idempotent: false });
  });

  it("returns validation issues without writing", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.submitWorkspaceForm.mockRejectedValue(
      new harness.FormValidationError()
    );
    const response = await POST(request({}), context("wi_1"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Validation failed",
      issues: [{ fieldId: "title" }],
    });
  });

  it("rejects a changed retry after final submission", async () => {
    harness.verifyUserAuthenticated.mockResolvedValue({
      user: { id: "user-1" },
    });
    harness.submitWorkspaceForm.mockRejectedValue(
      new harness.WorkspaceFormAlreadySubmittedError()
    );
    const response = await POST(request({ title: "Changed" }), context("wi_1"));
    expect(response.status).toBe(409);
  });
});
