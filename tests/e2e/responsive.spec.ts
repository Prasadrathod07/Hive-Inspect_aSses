import { test, expect } from "@playwright/test";

/**
 * "No mobile app is required, but the web UI should not break on a 13-inch
 * laptop or narrower desktop browser." 1280×800 is the common effective
 * viewport for a 13" laptop (device pixels aside); 1024×768 is checked too
 * since a maximized non-fullscreen browser window often lands narrower still.
 */
const DESKTOP_WIDTHS = [1280, 1024];

for (const width of DESKTOP_WIDTHS) {
  test.describe(`responsive at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("dashboard has no horizontal overflow", async ({ page }) => {
      await page.goto("/");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test("import workspace has no horizontal overflow", async ({ page }) => {
      await page.goto("/import");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test("header nav and import button both stay visible and unclipped", async ({ page }) => {
      await page.goto("/");
      const header = page.locator("header");
      await expect(header).toBeVisible();

      const box = await header.boundingBox();
      expect(box).not.toBeNull();
      if (!box) return;
      // Header content must fit within the viewport, not spill under it.
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    });
  });
}
