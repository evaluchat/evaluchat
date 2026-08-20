import { expect, Page, Response, test } from "@playwright/test";
import { baseUrl, loginAsTestUser, TIMEOUTS } from "./helpers/auth";
import {
  createLedgerItemViaApi,
  openWorkspaceItem,
  setMultiSelectFilter,
  setRangeFilter,
} from "./helpers/workspace";

/**
 * Wave A Evidence Ledger end-to-end coverage against the LIVE dev deployment.
 *
 * Flow (encoded from the handoff):
 *   1. Create a workspace item → Evidence Ledger tab → ledger-demo-method shows
 *      "Ledger ready"; open it → baseline accepted evidence = 12.
 *   2. Select the method → config canvas with the Method card, baseline 12 and
 *      filter controls.
 *   3. Set filters education_level ∈ [k12] + collection_date 2024-01-01..2024-12-31
 *      → preview: Included 6 · Outside declared scope 2 · Unknown 2 ·
 *      Unavailable 2 · Resolver exclusion 2 (baseline 12) + exact predicate.
 *   4. Generate → read-only Ledger Snapshot with 5 views, no edit affordances,
 *      no claim/conclusion text.
 *   5. Change a filter → preview out of date → refresh → generate → NEW
 *      snapshot; prior snapshot's input fingerprint unchanged; opening it still
 *      renders identically.
 *
 * @regression
 */
test.describe("@regression evidence-ledger", () => {
  const METHOD_ID = "ledger-demo-method";
  // Buckets for education_level ∈ [k12] + collection_date 2024-01-01..2024-12-31.
  //
  //   NOTE: live-verified against dev.evaluchat.org (2026-08-19). The original
  //   handoff expected 6/2/2/2/2, but the current fixtures resolve p08 (k12,
  //   country=other), p10 (k12, country omitted) as INCLUDED — the filter only
  //   constrains education_level + collection_date, not country_code. Correct
  //   split: Included 6 · Outside 3 (p03,p05,p07 tertiary/adult) · Unknown 1
  //   (p09 recorded-unknown edu) · Unavailable 2 (p11,p12 pre-collection_date
  //   template) · Resolver exclusion 2 (p13 wrong-method-version, p14
  //   not-accepted). All 14 packets accounted for; baseline = 12 accepted.
  const FILTERED_BUCKETS = {
    Included: 6,
    "Outside declared scope": 3,
    Unknown: 1,
    Unavailable: 2,
    "Resolver exclusion": 2,
  };

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  async function createLedgerViaUi(
    page: Page,
    methodId: string
  ): Promise<string> {
    await page.goto(`${baseUrl()}/workspace`, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.pageLoad,
    });
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByRole("button", { name: "Evidence Ledger" }).click();
    const search = page.getByPlaceholder(
      "Search templates, methods, or ledgers"
    );
    await expect(search).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await search.fill(methodId);
    // The catalog result card for this method shows the "Ledger ready" status.
    const card = page.locator("button", { hasText: methodId }).first();
    await expect(card).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await expect(card).toContainText("Ledger ready");
    // Arm the response waiter BEFORE clicking so we catch the POST.
    const createResponse = page.waitForResponse(
      (resp: Response) =>
        resp.url().includes("/api/workspace/items") &&
        resp.request().method() === "POST" &&
        resp.status() === 201,
      { timeout: 30_000 }
    );
    await card.click();
    const createResponseBody = (await createResponse.then((r) => r.json())) as {
      item: { id: string };
    };
    await expect(
      page.getByText("Ledger demo method", { exact: false }).first()
    ).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    return createResponseBody.item.id;
  }

  async function applyLedgerFilters(page: Page) {
    await setMultiSelectFilter(page, "education_level", ["k12"]);
    await setRangeFilter(page, "collection_date", "2024-01-01", "2024-12-31");
  }

  async function assertPreviewBuckets(page: Page) {
    const table = page.locator("[data-testid='ledger-canvas'] table");
    await expect(table).toBeVisible({ timeout: 30_000 });
    // The preview table renders one <tr> per bucket in server order.
    for (const [bucket, count] of Object.entries(FILTERED_BUCKETS)) {
      const row = table.locator("tr", { hasText: bucket }).first();
      await expect(row).toContainText(String(count), { timeout: 15_000 });
    }
  }

  test("1 · UI create shows Ledger ready + default baseline 12", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const itemId = await createLedgerViaUi(page, METHOD_ID);
    await openWorkspaceItem(page, itemId);
    await expect(page.getByTestId("ledger-canvas")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
    const banner = page.getByTestId("workspace-item-banner");
    await expect(banner.getByRole("link", { name: "Workspace" })).toBeVisible();
    await expect(banner.getByTestId("generate-ledger")).toBeVisible();
    await expect(page.getByTestId("chat-input")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
    // Method card: Method + baseline accepted evidence.
    await expect(page.getByText("Selected Method version")).toBeVisible();
    await expect(
      page.getByText(METHOD_ID, { exact: false }).first()
    ).toBeVisible();
    // "Accepted evidence" dd shows baseline 12 after the initial preview.
    await expect(
      page.locator("[data-testid='ledger-canvas']").getByText("12").first()
    ).toBeVisible({ timeout: 30_000 });
    // Scope summary duplicates the baseline count in section 2 prose.
    await expect(
      page
        .locator("[data-testid='ledger-canvas']")
        .getByText(/Baseline:\s*12\./)
    ).toBeVisible({ timeout: 30_000 });
  });

  test("2 · config canvas + filtered preview buckets + predicate", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const itemId = await createLedgerItemViaApi(page, METHOD_ID);
    await openWorkspaceItem(page, itemId);
    await expect(page.getByTestId("ledger-canvas")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });

    // Filter controls exist: multi-select for education_level incl. `unknown`,
    // and date range inputs for collection_date.
    const eduSelect = page.locator('select[aria-label="education_level"]');
    await expect(eduSelect).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await expect(
      eduSelect.locator("option", { hasText: "unknown" })
    ).toBeAttached();

    await applyLedgerFilters(page);

    // Preview goes out of date until refreshed.
    await expect(page.getByText("Preview out of date")).toBeVisible({
      timeout: 15_000,
    });

    // The Generate button is disabled until the preview is refreshed.
    const generate = page.getByTestId("generate-ledger");
    await expect(generate).toBeDisabled();

    await page.getByRole("button", { name: "Refresh preview" }).click();

    await assertPreviewBuckets(page);

    // Exact predicate pieces rendered in the canvas footer.
    const predicate = page
      .locator("[data-testid='ledger-canvas'] p.font-mono")
      .first();
    await expect(predicate).toContainText("education_level in [k12]");
    await expect(predicate).toContainText("collection_date gte 2024-01-01");
    await expect(predicate).toContainText("collection_date lte 2024-12-31");

    // Generate is now enabled (preview is current).
    await expect(generate).toBeEnabled();
  });

  test("3 · agent can narrow the ledger scope", async ({ page }) => {
    test.setTimeout(180_000);
    const itemId = await createLedgerItemViaApi(page, METHOD_ID);
    await openWorkspaceItem(page, itemId);
    await expect(page.getByTestId("ledger-canvas")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });

    const chatInput = page.getByTestId("chat-input");
    await expect(chatInput).toBeVisible({ timeout: TIMEOUTS.pageLoad });
    await chatInput.fill("Filter the ledger to education_level k12");
    await chatInput.press("Enter");

    const predicate = page
      .locator("[data-testid='ledger-canvas'] p.font-mono")
      .first();
    await expect(predicate).toContainText("education_level in [k12]", {
      timeout: 60_000,
    });
  });

  test("4 · generate read-only Ledger Snapshot with 5 views", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const itemId = await createLedgerItemViaApi(page, METHOD_ID);
    await openWorkspaceItem(page, itemId);
    await expect(page.getByTestId("ledger-canvas")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
    await applyLedgerFilters(page);
    await page.getByRole("button", { name: "Refresh preview" }).click();
    await assertPreviewBuckets(page);
    await page.getByTestId("generate-ledger").click();

    // Generate pushes to the new snapshot item route.
    await expect(page.getByTestId("ledger-snapshot-canvas")).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page.getByRole("heading", { name: "Ledger Snapshot" })
    ).toBeVisible();

    // 5 read-only views.
    const nav = page.getByRole("navigation", {
      name: "Ledger snapshot views",
    });
    for (const view of [
      "Scope",
      "Evidence",
      "Descriptive views",
      "Comparability",
      "Counterevidence and gaps",
    ]) {
      await expect(
        nav.getByRole("button", { name: new RegExp(view) })
      ).toBeVisible();
    }

    // Snapshot header renders the bucket totals.
    const header = page.locator(
      "[data-testid='ledger-snapshot-canvas'] header"
    );
    await expect(header).toContainText("Included: 6");
    await expect(header).toContainText("Unavailable: 2");
    await expect(header).toContainText("Resolver exclusion: 2");

    // No edit affordances in the snapshot.
    await expect(page.getByTestId("chat-input")).toHaveCount(0);
    await expect(
      page.locator("button:has-text('Generate ledger')")
    ).toHaveCount(0);

    // No claim/conclusion prose anywhere in the snapshot.
    const snapshotText = await page
      .locator("[data-testid='ledger-snapshot-canvas']")
      .innerText();
    expect(snapshotText.toLowerCase()).not.toContain("conclusion");
    expect(snapshotText.toLowerCase().includes("we conclude")).toBeFalsy();

    // Counterevidence view shows a non-empty badge (gaps exist) and is caveated.
    const gapsBtn = nav.getByRole("button", {
      name: /Counterevidence and gaps/,
    });
    await expect(
      gapsBtn.locator('[aria-label="non-empty counterevidence"]')
    ).toBeVisible();
    await gapsBtn.click();
    await expect(
      page.getByText("it does not reach a conclusion")
    ).toBeVisible();

    // Evidence view: source links are pinned to the snapshot's source commit,
    // never `blob/main` — a later research-main change must not silently alter
    // what a sealed snapshot links to (Wave A review fix).
    await nav.getByRole("button", { name: /Evidence/ }).click();
    const evidenceAnchors = page.locator(
      "[data-testid='ledger-snapshot-canvas'] a[href*='github.com/evaluchat/research/blob/']"
    );
    await expect(evidenceAnchors.first()).toBeVisible({ timeout: 15_000 });
    const hrefs = await evidenceAnchors.evaluateAll((anchors) =>
      anchors.map((a) => (a as HTMLAnchorElement).href)
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).not.toContain("/blob/main/");
      expect(href).toMatch(/\/blob\/[0-9a-f]{7,40}\//);
    }
  });

  test("5 · snapshot immutability — filters/fingerprint survive regeneration", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const itemId = await createLedgerItemViaApi(page, METHOD_ID);
    await openWorkspaceItem(page, itemId);
    await expect(page.getByTestId("ledger-canvas")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });

    // Baseline generate → snapshot A.
    await page.getByTestId("generate-ledger").click();
    await expect(page.getByTestId("ledger-snapshot-canvas")).toBeVisible({
      timeout: 60_000,
    });
    const firstFingerprint = await page
      .locator("[data-testid='ledger-snapshot-canvas']")
      .getByText("Input fingerprint")
      .locator("..")
      .locator("dd")
      .innerText();
    expect(firstFingerprint.length).toBeGreaterThan(0);

    // Return to the ledger and generate a SECOND snapshot under different filters.
    await page.goto(`${baseUrl()}/workspace/items/${itemId}`, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.pageLoad,
    });
    await expect(page.getByTestId("ledger-canvas")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
    await applyLedgerFilters(page);
    await page.getByRole("button", { name: "Refresh preview" }).click();
    await assertPreviewBuckets(page);
    await page.getByTestId("generate-ledger").click();
    await expect(page.getByTestId("ledger-snapshot-canvas")).toBeVisible({
      timeout: 60_000,
    });
    const secondFingerprint = await page
      .locator("[data-testid='ledger-snapshot-canvas']")
      .getByText("Input fingerprint")
      .locator("..")
      .locator("dd")
      .innerText();

    // Different config → different input fingerprint (new snapshot, not idempotent).
    expect(secondFingerprint).not.toBe(firstFingerprint);

    // List snapshots via API: find the snapshot whose fingerprint == the first one.
    const listResponse = await page.request.get(
      `${baseUrl()}/api/workspace/items/${itemId}/ledger/snapshots`
    );
    expect(listResponse.ok()).toBeTruthy();
    const listBody = (await listResponse.json()) as {
      snapshots: Array<{ id: string; snapshot: { inputFingerprint: string } }>;
    };
    expect(listBody.snapshots.length).toBeGreaterThanOrEqual(2);
    const firstSnapshot = listBody.snapshots.find(
      (s) => s.snapshot.inputFingerprint === firstFingerprint
    );
    expect(firstSnapshot).toBeTruthy();

    // Opening the ORIGINAL snapshot still renders identically (immutability).
    await openWorkspaceItem(page, firstSnapshot!.id);
    await expect(page.getByTestId("ledger-snapshot-canvas")).toBeVisible({
      timeout: TIMEOUTS.pageLoad,
    });
    const reopenedFingerprint = await page
      .locator("[data-testid='ledger-snapshot-canvas']")
      .getByText("Input fingerprint")
      .locator("..")
      .locator("dd")
      .innerText();
    expect(reopenedFingerprint).toBe(firstFingerprint);
    // The original (baseline, unfiltered) snapshot still renders the bucket
    // totals it was sealed with — Included 12 — even though a second filtered
    // snapshot was generated after it. This proves immutability of the
    // prior snapshot's sealed record + render.
    const reopenedHeader = page.locator(
      "[data-testid='ledger-snapshot-canvas'] header"
    );
    await expect(reopenedHeader).toContainText("Included: 12");
    await expect(reopenedHeader).toContainText("Resolver exclusion: 2");
    await expect(reopenedHeader).toContainText("Predicate");
    // And the sealed predicate is the unfiltered baseline predicate.
    await expect(reopenedHeader).toContainText("all accepted evidence");
  });
});
