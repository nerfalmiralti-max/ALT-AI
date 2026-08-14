import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const persistencePhase = process.env.ALT_QR_E2E_PHASE === "persistence";

async function expectNoAxeViolations(page: Page) {
  const result = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
  expect(result.violations, result.violations.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
}

test("home normalizes a bare domain before creating a scan", async ({ page }) => {
  test.skip(persistencePhase);
  let submittedUrl = "";
  await page.route("**/api/scans", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submittedUrl = (route.request().postDataJSON() as { url: string }).url;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ scanId: "00000000-0000-4000-8000-000000000000" }) });
  });
  await page.goto("/");
  await page.getByLabel("Website URL").fill("example.com");
  await page.getByRole("button", { name: "Scan website" }).click();
  await expect.poll(() => submittedUrl).toBe("https://example.com");
});

test("scan, inspect, compare, cancel, and print the rescued report", async ({ page }) => {
  test.skip(persistencePhase);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Check a site before you ship." })).toBeVisible();
  for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px home viewport should not overflow horizontally`).toBeLessThanOrEqual(1);
  }
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to scanner" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#scan-main$/);
  await expectNoAxeViolations(page);

  await page.getByLabel("Website URL").fill("http://127.0.0.1:4173/");
  await page.getByLabel("Website URL").press("Enter");
  await expect(page).toHaveURL(/\/scan\/[0-9a-f-]+/);
  await expect(page.getByText("Current stage", { exact: true })).toBeVisible();
  await expect(page.getByText("Elapsed", { exact: true })).toBeVisible();
  await expect(page.getByText("Current page", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /release gate check/i })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Quality score", { exact: true })).toBeVisible();
  await expect(page.getByText("Release gate", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fix these first" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where quality is weakest" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What changed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Issue ledger" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pages" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Visual inspector" })).toBeVisible();
  await expectNoAxeViolations(page);

  expect(await page.locator(".issue-group").count()).toBeGreaterThan(0);
  const search = page.getByRole("searchbox", { name: "Search" });
  await search.fill("console warning");
  await expect(page.locator(".issue-group")).toHaveCount(1);
  await search.fill("");
  await page.locator(".fix-first a[aria-label^='Open evidence']").first().click();
  const firstIssue = page.locator(".issue-group").first();
  await expect(firstIssue).toHaveAttribute("open", "");
  await firstIssue.locator(":scope > summary").focus();
  await firstIssue.locator(":scope > summary").press("Enter");
  await expect(firstIssue).not.toHaveAttribute("open", "");
  await firstIssue.locator(":scope > summary").press("Enter");
  await expect(firstIssue.locator(".affected-pages code").first()).toContainText("/");
  const pageEvidenceLink = firstIssue.locator(".affected-pages a").first();
  const pageEvidenceTarget = await pageEvidenceLink.getAttribute("href");
  await pageEvidenceLink.click();
  await expect(page.locator(pageEvidenceTarget!)).toHaveAttribute("open", "");
  const firstOccurrence = firstIssue.locator(".occurrence").first();
  await firstOccurrence.locator(":scope > summary").press("Enter");
  await expect(firstOccurrence).toHaveAttribute("open", "");
  await expect(firstOccurrence.getByText("URL", { exact: true })).toBeVisible();
  const lifecycleButton = firstOccurrence.getByRole("button", { name: "Ignore finding" });
  await lifecycleButton.click();
  await page.getByLabel("State").selectOption("IGNORED");
  const ignoredGroup = page.locator(".issue-group").first();
  await ignoredGroup.locator(":scope > summary").click();
  const ignoredOccurrence = ignoredGroup.locator(".occurrence").first();
  await ignoredOccurrence.locator(":scope > summary").click();
  await ignoredOccurrence.getByRole("button", { name: "Restore finding" }).click();
  await page.getByLabel("State").selectOption("ALL");

  const firstPage = page.locator(".page-item").first();
  await firstPage.locator(":scope > summary").press("Enter");
  await expect(firstPage).toHaveAttribute("open", "");
  await expect(firstPage.getByRole("heading", { name: "Page health" })).toBeVisible();

  const visual = page.locator("#visual");
  await expect(visual.getByRole("img", { name: /current.*desktop screenshot/i })).toBeVisible();
  await visual.getByRole("button", { name: /open current.*desktop screenshot fullscreen/i }).click();
  const dialog = page.getByRole("dialog", { name: /current.*desktop/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Zoom in" }).click();
  await expect(dialog.getByRole("status")).toHaveText("125%");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await visual.getByRole("button", { name: "Mobile" }).click();
  await expect(visual.getByRole("img", { name: /current.*mobile screenshot/i })).toBeVisible();

  await page.getByRole("button", { name: "Set baseline" }).click();
  await expect(page.getByRole("status")).toContainText("project baseline", { ignoreCase: true });
  const firstReportUrl = page.url().replace(/#.*$/, "");
  await page.request.post("http://127.0.0.1:4173/__variant?value=B");
  await page.getByRole("button", { name: "Rescan" }).click();
  await expect(page).not.toHaveURL(firstReportUrl);
  await expect(page.getByRole("heading", { name: /release gate check/i })).toBeVisible({ timeout: 120_000 });

  await expect(page.getByRole("heading", { name: "What changed" })).toBeVisible();
  await expect(page.locator(".change-summary").getByText("Fixed", { exact: true })).toBeVisible();
  await expect(page.locator(".change-summary").getByText("New", { exact: true })).toBeVisible();
  await expect(page.locator(".change-summary").getByText("Regressions", { exact: true })).toBeVisible();
  await expect(page.locator(".change-list").getByText("FIXED", { exact: true }).first()).toBeVisible();
  await page.getByLabel("State").selectOption("NEW");
  await search.fill("Heading levels");
  await expect(page.locator(".issue-group").filter({ hasText: "Heading levels are skipped" })).toBeVisible();
  await page.getByLabel("Category").selectOption("seo");
  await expect(page.locator(".issue-group")).toHaveCount(1);
  await search.fill("");
  await page.getByLabel("Category").selectOption("all");
  await page.getByLabel("State").selectOption("ALL");
  await expect(page.locator(".scan-history li")).toHaveCount(2);
  await page.locator(".category-matrix button").filter({ hasText: "performance" }).click();
  await expect(page.getByLabel("Category")).toHaveValue("performance");
  await page.getByRole("button", { name: "All issues" }).click();
  await expect(page.getByLabel("Category")).toHaveValue("all");
  await page.getByRole("link", { name: "Compare", exact: true }).click();
  await expect(page).toHaveURL(/#changed$/);
  const secondVisual = page.locator("#visual");
  await secondVisual.getByRole("button", { name: "Mobile" }).click();
  await expect(secondVisual.getByRole("button", { name: "Baseline", exact: true })).toBeEnabled();
  await expect(secondVisual.getByRole("button", { name: "Diff", exact: true })).toBeEnabled();
  await secondVisual.getByRole("button", { name: "Baseline", exact: true }).click();
  await secondVisual.getByRole("button", { name: "Compare", exact: true }).click();
  await secondVisual.getByRole("button", { name: "Diff", exact: true }).click();
  await expect(secondVisual.getByRole("img", { name: /diff.*mobile screenshot/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export" })).toHaveAttribute("download", "");
  const exportHref = await page.getByRole("link", { name: "Export" }).getAttribute("href");
  expect((await page.request.get(exportHref!)).status()).toBe(200);

  const reportBeforeGateEdit = page.url().replace(/#.*$/, "");
  await page.getByText("Release gate settings", { exact: true }).click();
  await page.getByLabel("Minimum score").fill("79");
  await page.getByRole("button", { name: "Save gate" }).click();
  await expect(page.getByRole("status")).toContainText("Release gate updated");
  expect(page.url().replace(/#.*$/, "")).toBe(reportBeforeGateEdit);
  const historical = page.locator(".scan-history a").last();
  await historical.click();
  await expect(page).toHaveURL(firstReportUrl);
  await expect(page.getByText("Quality score", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByText("Quality score", { exact: true })).toBeVisible();
  expect(page.url().startsWith(reportBeforeGateEdit)).toBe(true);

  await page.evaluate(() => { (window as typeof window & { __printCalled?: boolean }).__printCalled = false; window.print = () => { (window as typeof window & { __printCalled?: boolean }).__printCalled = true; }; });
  await page.getByRole("button", { name: "Print" }).click();
  expect(await page.evaluate(() => (window as typeof window & { __printCalled?: boolean }).__printCalled)).toBe(true);

  for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px report viewport should not overflow horizontally`).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoAxeViolations(page);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  const comparedReportUrl = page.url();
  await page.getByRole("button", { name: "Rescan" }).click();
  await expect(page).not.toHaveURL(comparedReportUrl);
  await expect(page.getByRole("button", { name: "Cancel scan" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel scan" }).click();
  await expect(page.getByRole("heading", { name: "Scan cancelled" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rescan" })).toBeVisible();
});

test("persisted report, baseline, history, issues, metrics, and screenshots survive an application restart", async ({ page, request }) => {
  test.skip(!persistencePhase);
  const response = await request.get("/api/scans");
  expect(response.ok()).toBeTruthy();
  const body = await response.json() as { scans: Array<{ id: string; progress: { stage: string } }> };
  const complete = body.scans.find((scan) => scan.progress.stage === "COMPLETE");
  expect(complete).toBeTruthy();
  const persistedPayload = await (await request.get(`/api/scans/${complete!.id}`)).json() as { baseline: { id: string } | null };
  expect(persistedPayload.baseline?.id).toBeTruthy();
  await page.goto(`/scan/${complete!.id}`);
  await expect(page.getByText("Quality score", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Baseline", exact: true }).first()).toBeEnabled();
  await expect(page.locator(".scan-history li")).toHaveCount(3);
  await expect(page.locator(".issue-group").first()).toBeVisible();
  await page.getByRole("link", { name: "Visual", exact: true }).click();
  await expect(page.locator("#visual").getByRole("img", { name: /current.*desktop screenshot/i })).toBeVisible();
  await expect(page.locator(".performance-grid").first()).toBeVisible();
  await page.getByRole("link", { name: "New scan" }).click();
  await expect(page.getByRole("heading", { name: "Check a site before you ship." })).toBeVisible();
});
