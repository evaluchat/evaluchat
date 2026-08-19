import { describe, expect, it } from "vitest";
import { buildWorkspaceItemCreateBody } from "./create-workspace-item-dialog";

describe("CreateWorkspaceItemDialog request bodies", () => {
  it("creates a plain method item request body", () => {
    expect(
      buildWorkspaceItemCreateBody({ id: "method-1", kind: "method" })
    ).toEqual({ kind: "method", methodId: "method-1" });
  });

  it("creates an Evidence Ledger item request body", () => {
    expect(
      buildWorkspaceItemCreateBody({ id: "ledger-demo-method", kind: "ledger" })
    ).toEqual({ kind: "ledger", methodId: "ledger-demo-method" });
  });
});
