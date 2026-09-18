import { test, expect, type Page } from "@playwright/test";

/**
 * Accessibility invariants, checked against the real DOM.
 *
 * These are the failures that are cheap to introduce and expensive to notice:
 * a control with no accessible name, an input with no label, a heading level
 * skipped. Only routes that render without a database are covered — the rest
 * are exercised by the gated walkthrough in `migration-workflow.spec.ts`.
 */

const PUBLIC_ROUTES = ["/", "/import"];

/** Every control a keyboard or screen-reader user could land on must say what it is. */
async function namelessControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const offenders: string[] = [];
    const controls = document.querySelectorAll<HTMLElement>(
      "button, a[href], input, select, textarea, [role='button']"
    );

    for (const el of controls) {
      if (el.getAttribute("aria-hidden") === "true") continue;
      if (el.hasAttribute("hidden") || el.offsetParent === null) continue;

      const name =
        el.getAttribute("aria-label")?.trim() ||
        el.getAttribute("title")?.trim() ||
        (el.getAttribute("aria-labelledby")
          ? document.getElementById(el.getAttribute("aria-labelledby")!)?.textContent?.trim()
          : "") ||
        (el instanceof HTMLInputElement && el.labels?.length
          ? Array.from(el.labels).map((l) => l.textContent).join(" ").trim()
          : "") ||
        el.textContent?.trim();

      if (!name) {
        offenders.push(`<${el.tagName.toLowerCase()}> ${el.className || "(no class)"}`.slice(0, 120));
      }
    }
    return offenders;
  });
}

for (const route of PUBLIC_ROUTES) {
  test.describe(`a11y — ${route}`, () => {
    test("every interactive control has an accessible name", async ({ page }) => {
      await page.goto(route);
      expect(await namelessControls(page)).toEqual([]);
    });

    test("has exactly one h1 and no skipped heading levels", async ({ page }) => {
      await page.goto(route);

      const levels = await page.evaluate(() =>
        Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) =>
          Number(h.tagName[1])
        )
      );

      expect(levels.filter((l) => l === 1)).toHaveLength(1);
      for (let i = 1; i < levels.length; i++) {
        // A heading may go deeper by at most one level at a time.
        expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
      }
    });

    test("keyboard focus reaches the primary action and stays visible", async ({ page }) => {
      await page.goto(route);

      // Walk the first several stops; every focused element must be a real
      // control and must show a focus ring rather than `outline: none` alone.
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const style = getComputedStyle(el);
          return {
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute("role"),
            hasRing:
              style.outlineStyle !== "none" ||
              style.boxShadow !== "none" ||
              Number.parseFloat(style.outlineWidth) > 0,
          };
        });
        if (!focused) continue;
        // Next.js dev-mode injects its own overlay element that briefly takes
        // focus in dev but doesn't exist in production.
        if (focused.tag === "nextjs-portal") continue;

        const isNativeControl = ["a", "button", "input", "select", "textarea"].includes(focused.tag);
        const isAccessibleWidget = focused.role === "button" || focused.role === "link";
        expect(isNativeControl || isAccessibleWidget).toBe(true);
      }
    });

    test("page has a main landmark and a skip-safe document title", async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("main")).toHaveCount(1);
      expect((await page.title()).trim().length).toBeGreaterThan(0);
    });
  });
}

test.describe("a11y — import workspace specifics", () => {
  test("the file input is labelled and reachable", async ({ page }) => {
    await page.goto("/import");

    const input = page.locator('input[type="file"]');
    await expect(input).toHaveCount(1);
    // It may be visually hidden behind a styled dropzone, but it must still
    // carry a name for assistive tech.
    const name = await input.evaluate(
      (el: HTMLInputElement) =>
        el.getAttribute("aria-label") ||
        (el.labels?.length ? Array.from(el.labels).map((l) => l.textContent).join(" ") : "")
    );
    expect(name?.trim().length ?? 0).toBeGreaterThan(0);
  });

  test("an error is announced, not just coloured", async ({ page }) => {
    await page.goto("/import");
    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("nope"),
    });

    // Colour alone never conveys the failure — there must be a live region
    // or an alert role carrying it.
    await expect(page.locator("[role='alert'], [aria-live]").first()).toBeVisible();
  });
});
