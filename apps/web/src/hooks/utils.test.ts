import { describe, expect, it } from "vitest";
import { resolveApiUrl } from "./utils";

describe("resolveApiUrl", () => {
  const origin = "https://dev.evaluchat.com";

  it("resolves relative /api against the page origin", () => {
    expect(resolveApiUrl("/api", origin)).toBe("https://dev.evaluchat.com/api");
  });

  it("keeps same-origin absolute URLs", () => {
    expect(resolveApiUrl("https://dev.evaluchat.com/api", origin)).toBe(
      "https://dev.evaluchat.com/api"
    );
  });

  it("rejects cross-origin Tailscale/MC URLs that cause CORS", () => {
    expect(
      resolveApiUrl("https://cronje-home.tail8977d3.ts.net:8443", origin)
    ).toBe("https://dev.evaluchat.com/api");
  });

  it("falls back when configured value is invalid", () => {
    expect(resolveApiUrl("not a url", origin)).toBe(
      "https://dev.evaluchat.com/api"
    );
  });
});
