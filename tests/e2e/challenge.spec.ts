import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const persistencePhase = process.env.ALT_QR_E2E_PHASE === "persistence";

async function expectNoAxeViolations(page: Page) {
  const result = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
  expect(result.violations, result.violations.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
}

async function expectNoOverflow(page: Page, surface: string) {
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${surface} should not overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
}

test.afterEach(async ({ request }) => {
  if (persistencePhase) return;
  await Promise.all([
    request.post("http://127.0.0.1:4173/__variant?value=A").catch(() => undefined),
    request.post("http://127.0.0.1:4174/__variant?value=B").catch(() => undefined),
  ]);
});

test("real challenge proves a QA miss, preserves the result after a fixed rerun, and fails closed", async ({ page, request }) => {
  test.skip(persistencePhase);
  test.setTimeout(420_000);

  await page.goto("/challenge");
  await expect(page.getByRole("heading", { name: "Beat Your Stack" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Current QA verdict/ })).toHaveValue("UNKNOWN");
  await expectNoOverflow(page, "challenge entry");
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoAxeViolations(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  await request.post("http://127.0.0.1:4174/__variant?value=C");

  await page.getByRole("textbox", { name: /Production URL/ }).fill("http://127.0.0.1:4173/");
  await page.getByRole("textbox", { name: /Preview \/ Candidate URL/ }).fill("http://127.0.0.1:4174/");
  await page.getByRole("combobox", { name: /Current QA verdict/ }).selectOption("PASSED");
  await page.getByRole("textbox", { name: /Existing QA stack/ }).fill("Playwright + internal QA");
  await page.getByRole("button", { name: "Run Challenge" }).click();
  await expect(page).toHaveURL(/\/challenge\/[0-9a-f-]+$/);
  await expect(page.getByText("Live evidence run")).toBeVisible();
  await expect(page.getByRole("heading", { name: "ALT QR found what your QA missed." })).toBeVisible({ timeout: 300_000 });

  const result = page.locator(".challenge-result");
  await expect(result.getByText("Your QA", { exact: true })).toBeVisible();
  await expect(result.getByText("PASS", { exact: true })).toBeVisible();
  await expect(result.getByText("ALT QR", { exact: true })).toBeVisible();
  await expect(result.getByLabel("Existing QA compared with ALT QR").getByText("HOLD", { exact: true })).toBeVisible();
  await expect(page.getByText("1 QA blind spot exposed", { exact: true })).toBeVisible();
  await expect(page.getByText("Preliminary READY revoked.", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1 blocker confirmed", { exact: true })).toBeVisible();
  await expect(page.getByText("Red Team discovery", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Not detected during primary verification", { exact: true }).first()).toBeVisible();
  const confirmed = page.locator('.challenge-finding[data-classification="NEW_REGRESSION"]').first();
  await expect(confirmed.getByRole("heading", { name: "Unhandled page exception" })).toBeVisible();
  await expect(confirmed.getByText("Reproduced 2/2", { exact: true })).toBeVisible();
  await expect(confirmed.getByText("red team route regression", { exact: true })).toBeVisible();
  await expectNoOverflow(page, "challenge result");
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoAxeViolations(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  const reportHref = await page.getByRole("link", { name: /Print report/ }).getAttribute("href");
  expect(reportHref).toMatch(/\/challenge\/[0-9a-f-]+\/report/);
  const reportResponse = await request.get(reportHref!);
  expect(reportResponse.ok()).toBeTruthy();
  const reportText = await reportResponse.text();
  expect(reportText).toContain("ALT QR found what your QA missed.");
  expect(reportText).not.toMatch(/authorization|cookie|call log:|[a-z]:\\users\\/i);

  await request.post("http://127.0.0.1:4174/__variant?value=A");
  await page.getByRole("button", { name: "Run Challenge Again" }).click();
  await expect(page.getByText("Live evidence run")).toBeVisible();
  await expect(page.getByRole("heading", { name: "We couldn’t beat your stack on this release." })).toBeVisible({ timeout: 300_000 });
  await expect(page.getByText("No blocker confirmed", { exact: true })).toBeVisible();
  await expect(page.getByText("Adversarially verified", { exact: true })).toBeVisible();
  await expect(page.getByText("Fixed in latest rerun", { exact: true })).toBeVisible();
  await expect(page.locator(".challenge-history__list article")).toHaveCount(2);
  await expect(page.locator(".challenge-history__list").getByText("ALT QR WON", { exact: true })).toBeVisible();

  await page.goto("/challenge");
  await page.getByRole("textbox", { name: /Production URL/ }).fill("http://127.0.0.1:4173/");
  await page.getByRole("textbox", { name: /Preview \/ Candidate URL/ }).fill("http://127.0.0.1:4174/partial-failure");
  await page.getByRole("combobox", { name: /Current QA verdict/ }).selectOption("PASSED");
  await page.getByRole("button", { name: "Run Challenge" }).click();
  await expect(page.getByRole("heading", { name: "The evidence is not strong enough for a verdict." })).toBeVisible({ timeout: 300_000 });
  await expect(page.locator(".challenge-result").getByText("INCONCLUSIVE", { exact: true })).toBeVisible();
  await expect(page.getByText(/no pass or competitive claim/i)).toBeVisible();
  await expectNoOverflow(page, "incomplete challenge result");
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoAxeViolations(page);
});
