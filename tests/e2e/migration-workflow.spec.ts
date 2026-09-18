import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

/**
 * The nine-step reviewer walkthrough.
 *
 * Steps 1 and 9 need no database and always run. Steps 2–8 write to Supabase,
 * so they are gated on `E2E_LIVE_DB=true` and skip with a stated reason
 * otherwise — a skipped test that says why is honest; a failing test that
 * everyone learns to ignore is not.
 *
 * To run the full walkthrough: apply the migrations, set
 * SUPABASE_SERVICE_ROLE_KEY, then `E2E_LIVE_DB=true npm run test:e2e`.
 */

// Playwright runs from the project root.
const FIXTURE = path.resolve(process.cwd(), "tests/fixtures/synthetic-spectora-like.xlsx");

const LIVE_DB = process.env.E2E_LIVE_DB === "true";
const NEEDS_DB = "Requires a live Supabase database (set E2E_LIVE_DB=true after applying migrations).";

/** Uploads a file to the import workspace and waits for the outcome. */
async function uploadFile(page: Page, filePath: string) {
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await page.getByRole("button", { name: /start import|import template/i }).click();
}

test.describe("1. Dashboard", () => {
  test("opens and renders without a client-side crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Templates", exact: true })).toBeVisible();
    // Either real templates, an empty state, or an honest error — never a blank page.
    await expect(
      page.getByRole("link", { name: /import template/i }).first()
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("never exposes internal error detail to the visitor", async ({ page }) => {
    await page.goto("/");
    const body = (await page.textContent("body")) ?? "";

    expect(body).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(body).not.toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(body).not.toContain("postgresql://");
    expect(body).not.toMatch(/at\s+\/.*\.js:\d+/);
  });
});

test.describe("9. Bad-file failure", () => {
  test("rejects a renamed non-spreadsheet with an honest, specific reason", async ({ page }) => {
    // The walkthrough demo case: named .xlsx, but its bytes are not a workbook.
    await page.goto("/import");
    await page.locator('input[type="file"]').setInputFiles({
      name: "spectora-export.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("%PDF-1.7 this is definitely not a workbook"),
    });
    await page.getByRole("button", { name: /start import|import template/i }).click();

    await expect(page.getByText(/named like a spreadsheet, but its contents aren't one/i)).toBeVisible();
    // It must not claim the server is broken.
    await expect(page.getByText(/workspace isn't finished setting up/i)).toHaveCount(0);
  });

  test("rejects an unsupported extension before upload", async ({ page }) => {
    await page.goto("/import");
    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("just some notes"),
    });

    await expect(page.getByText(/unsupported file type/i)).toBeVisible();
  });

  test("keeps the workspace usable after a failure", async ({ page }) => {
    await page.goto("/import");
    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("nope"),
    });
    await expect(page.getByText(/unsupported file type/i)).toBeVisible();

    // A rejected file must be replaceable without a reload.
    await page.locator('input[type="file"]').setInputFiles(FIXTURE);
    await expect(page.getByText(/unsupported file type/i)).toHaveCount(0);
  });
});

test.describe("2–8. Full migration walkthrough", () => {
  test.skip(!LIVE_DB, NEEDS_DB);

  let templateId = "";
  let copyName = "";

  test("2. imports the fixture and lands on the import report", async ({ page }) => {
    await uploadFile(page, FIXTURE);

    await page.waitForURL(/\/templates\/[^/]+\/import-report/, { timeout: 45_000 });
    templateId = page.url().match(/\/templates\/([^/]+)\//)?.[1] ?? "";
    expect(templateId).not.toBe("");
  });

  test("3. shows the deterministic integrity report", async ({ page }) => {
    await page.goto(`/templates/${templateId}/import-report`);

    await expect(page.getByText("Import Integrity")).toBeVisible();
    // The literal preservation claim, and never a fabricated percentage.
    await expect(page.getByText(/\d+ unaccounted source rows?/)).toBeVisible();
    await expect(page.getByText(/\d+%\s*(score|confidence|verified)/i)).toHaveCount(0);
  });

  test("3b. the AI section never hides the deterministic result", async ({ page }) => {
    await page.goto(`/templates/${templateId}/import-report`);

    // Metrics are present regardless of what the AI section resolves to.
    await expect(page.getByText("Import Integrity")).toBeVisible();
    await expect(page.getByText("AI Import Review")).toBeVisible();
    await expect(
      page.getByText(/AI review is unavailable|Suggested attention level|could not be/i)
    ).toBeVisible();
  });

  test("4. edits a section name", async ({ page }) => {
    await page.goto(`/templates/${templateId}`);

    const field = page.getByRole("textbox").first();
    await field.click();
    await field.fill("Roof — edited by e2e");
    await expect(page.getByText(/saved/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("5. the edit survives a refresh", async ({ page }) => {
    // A fresh page load, reading from Postgres — not a client-side cache.
    await page.goto(`/templates/${templateId}`);
    await expect(page.getByRole("textbox").first()).toHaveValue("Roof — edited by e2e");
  });

  test("6. duplicates the template", async ({ page }) => {
    await page.goto(`/templates/${templateId}`);
    await page.getByRole("button", { name: /duplicate/i }).first().click();

    const nameInput = page.getByRole("textbox").filter({ hasText: "" }).last();
    copyName = `E2E Copy ${Date.now()}`;
    await nameInput.fill(copyName);
    await page.getByRole("button", { name: /duplicate|create copy/i }).last().click();

    await page.waitForURL(/\/templates\/[^/]+$/, { timeout: 30_000 });
    expect(page.url()).not.toContain(templateId);
  });

  test("7. edits the copy", async ({ page }) => {
    await page.goto("/");
    await page.getByText(copyName).click();

    const field = page.getByRole("textbox").first();
    await field.fill("Changed only on the copy");
    await expect(page.getByText(/saved/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("8. the original is unchanged by the copy's edit", async ({ page }) => {
    await page.goto(`/templates/${templateId}`);

    await expect(page.getByRole("textbox").first()).toHaveValue("Roof — edited by e2e");
    // The copy's edit must not have reached the original anywhere in the tree.
    await expect(page.locator('input[value="Changed only on the copy"]')).toHaveCount(0);
  });
});
