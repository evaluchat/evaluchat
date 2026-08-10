import { describe, expect, it } from "vitest";
import { config } from "./middleware";
import { isPublicPath } from "./lib/supabase/middleware";

describe("middleware public routes", () => {
  it("keeps API routes behind the session-aware middleware", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    expect(matcher.test("/api/teaching/assignments")).toBe(true);
    expect(matcher.test("/api/tracking/events")).toBe(true);
  });

  it("treats privacy and terms as unauthenticated public paths", () => {
    expect(isPublicPath("/privacy")).toBe(true);
    expect(isPublicPath("/terms")).toBe(true);
    expect(isPublicPath("/auth/login")).toBe(true);
    expect(isPublicPath("/teacher")).toBe(false);
    expect(isPublicPath("/privacy-extra")).toBe(false);
  });
});
