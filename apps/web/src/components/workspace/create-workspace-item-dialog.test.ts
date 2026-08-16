import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildWorkspaceItemCreateBody,
  MethodByokShareControl,
} from "./create-workspace-item-dialog";

describe("CreateWorkspaceItemDialog BYOK sharing", () => {
  it("renders the method sharing checkbox when an enabled provider is configured", () => {
    const markup = renderToStaticMarkup(
      createElement(MethodByokShareControl, {
        settings: { enabled: true, shareMode: "none" },
        loading: false,
        checked: false,
        onCheckedChange: () => undefined,
      })
    );

    expect(markup).toContain("Share my BYOK provider with participants");
    expect(markup).toContain(
      "Levels the playing field — all participants use your provider for this assignment"
    );
    expect(markup).toContain('data-testid="share-byok"');
  });

  it("disables sharing when no enabled provider is configured", () => {
    const markup = renderToStaticMarkup(
      createElement(MethodByokShareControl, {
        settings: null,
        loading: false,
        checked: false,
        onCheckedChange: () => undefined,
      })
    );

    expect(markup).toContain('data-testid="share-byok"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain(
      "Configure a provider in workspace settings first"
    );
  });

  it("shows a static note when all assignments are already shared", () => {
    const markup = renderToStaticMarkup(
      createElement(MethodByokShareControl, {
        settings: { enabled: true, shareMode: "all_assignments" },
        loading: false,
        checked: false,
        onCheckedChange: () => undefined,
      })
    );

    expect(markup).toContain(
      "Your provider is shared with all assignments — participants will use it."
    );
    expect(markup).not.toContain('data-testid="share-byok"');
  });

  it("adds shareByok to a method creation POST body when checked", () => {
    expect(
      buildWorkspaceItemCreateBody({ id: "method-1", kind: "method" }, true)
    ).toEqual({ kind: "method", methodId: "method-1", shareByok: true });
  });
});
