import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PrivacyPolicyContent } from "./privacy-policy-content";
import { TermsOfServiceContent } from "./terms-of-service-content";

describe("legal page content fingerprints", () => {
  it("privacy names the operator, Creem MoR, and AI training disclosure", () => {
    const html = renderToStaticMarkup(
      React.createElement(PrivacyPolicyContent)
    );
    expect(html).toContain("Abraham van Heerden");
    expect(html).toContain("Armitage Labs");
    expect(html).toMatch(/train/i);
    expect(html).toContain("hello@evaluchat.com");
    expect(html).toMatch(/Cookies/i);
    expect(html).toMatch(/advertising or cross-site tracking/i);
  });

  it("terms cover Creem MoR, credits, and AI training cross-link", () => {
    const html = renderToStaticMarkup(
      React.createElement(TermsOfServiceContent)
    );
    expect(html).toContain("Abraham van Heerden");
    expect(html).toContain("Armitage Labs");
    expect(html).toContain("/privacy");
    expect(html).toMatch(/train/i);
    expect(html).toContain("hello@evaluchat.com");
  });
});
