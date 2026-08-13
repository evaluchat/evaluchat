import { describe, expect, it } from "vitest";
import { isE2eBypassRequest } from "./middleware";

describe("isE2eBypassRequest", () => {
  it("requires both env gate and cookie (fail closed)", () => {
    expect(isE2eBypassRequest(undefined, "true")).toBe(false);
    expect(isE2eBypassRequest("true", undefined)).toBe(false);
    expect(isE2eBypassRequest("true", "true")).toBe(true);
    expect(isE2eBypassRequest("false", "true")).toBe(false);
    expect(isE2eBypassRequest(undefined, undefined)).toBe(false);
  });
});
