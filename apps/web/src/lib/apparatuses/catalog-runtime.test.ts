import { describe, expect, it } from "vitest";
import { APPARATUS_CATALOG, validateApparatusCatalog } from "./catalog";
import { validateApparatusConfiguration } from "@opencanvas/shared";
import { getTemplateById } from "../workspace/template-catalog";

describe("generated apparatus catalog", () => {
  it("contains the canonical Essays profile and contrasting valid paths", () => {
    const essays = APPARATUS_CATALOG.find(
      (entry) => entry.id === "ai-assisted-essay"
    );
    expect(essays).toBeDefined();
    expect(essays?.profiles.map((profile) => profile.id)).toEqual([
      "canonical-constrained-dialogue",
      "gate-off",
      "ai-off",
      "canvas-actions-off",
      "tracking-off",
    ]);
    expect(essays?.run_brief_template).toBe("evaluchat-assignment-brief@1.0.0");
    const brief = getTemplateById("evaluchat-assignment-brief");
    expect(brief?.templateKind).toBe("form");
    expect(brief?.version).toBe("1.0.0");
    expect(essays?.platform).toEqual({
      participant_invitations: "required",
      review_surface: "essay-process-review",
    });

    for (const profile of essays?.profiles ?? []) {
      expect(
        validateApparatusConfiguration(essays!, profile.configuration)
      ).toEqual([]);
    }
  });

  it("rejects unknown capabilities, incompatible canvas versions, and non-viable workflows", () => {
    const essays = APPARATUS_CATALOG.find(
      (entry) => entry.id === "ai-assisted-essay"
    )!;

    expect(() =>
      validateApparatusCatalog([
        {
          ...essays,
          required_capabilities: [...essays.required_capabilities, "unknown"],
        } as never,
      ])
    ).toThrow(/unknown capability/);

    expect(() =>
      validateApparatusCatalog([{ ...essays, min_canvas_version: "99.0.0" }])
    ).toThrow(/requires canvas/);

    expect(() =>
      validateApparatusCatalog([
        {
          ...essays,
          required_capabilities: essays.required_capabilities.filter(
            (capability) => capability !== "submission"
          ),
        },
      ])
    ).toThrow(/viable student workflow/);
  });

  it("rejects profiles whose knobs violate treatment dependencies", () => {
    const essays = APPARATUS_CATALOG.find(
      (entry) => entry.id === "ai-assisted-essay"
    )!;
    expect(() =>
      validateApparatusCatalog([
        {
          ...essays,
          profiles: [
            {
              ...essays.profiles[0],
              configuration: {
                ...essays.profiles[0].configuration,
                drafting_gate: "none",
                threshold: 4,
              },
            },
          ],
        },
      ])
    ).toThrow(/threshold must be zero/);
  });

  it("accepts every supported optional-capability combination with a viable workflow", () => {
    const essays = APPARATUS_CATALOG.find(
      (entry) => entry.id === "ai-assisted-essay"
    )!;
    const valid: unknown[] = [];

    for (const ai_assistance of [false, true]) {
      for (const ai_canvas_actions of [false, true]) {
        for (const drafting_gate of [
          "none",
          "discussion-first",
          "thesis-approved",
        ] as const) {
          for (const threshold of [0, 1, 4]) {
            for (const tracking of [false, true]) {
              const configuration = {
                ai_assistance,
                ai_canvas_actions,
                drafting_gate,
                threshold,
                tracking,
              };
              if (
                validateApparatusConfiguration(essays, configuration).length ===
                0
              ) {
                valid.push(configuration);
              }
            }
          }
        }
      }
    }

    expect(valid.length).toBeGreaterThan(0);
    expect(valid).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ai_assistance: false,
          ai_canvas_actions: false,
          drafting_gate: "none",
        }),
        expect.objectContaining({
          ai_assistance: true,
          drafting_gate: "none",
          threshold: 0,
        }),
        expect.objectContaining({ tracking: false }),
      ])
    );
  });
});
