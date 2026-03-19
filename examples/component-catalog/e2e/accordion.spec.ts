import { expect, test } from '@playwright/test';

test.describe('Accordion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/accordion');
    // Wait for hydration to complete — triggers become interactive
    await page.locator('[data-accordion-trigger]').first().waitFor();
  });

  test('renders all accordion triggers', async ({ page }) => {
    const triggers = page.locator('[data-accordion-trigger]');
    await expect(triggers).toHaveCount(3);
    await expect(triggers.nth(0)).toHaveText('Is it accessible?');
    await expect(triggers.nth(1)).toHaveText('Is it styled?');
    await expect(triggers.nth(2)).toHaveText('Is it animated?');
  });

  test('all items start collapsed', async ({ page }) => {
    const triggers = page.locator('[data-accordion-trigger]');
    for (let i = 0; i < 3; i++) {
      await expect(triggers.nth(i)).toHaveAttribute('aria-expanded', 'false');
      await expect(triggers.nth(i)).toHaveAttribute('data-state', 'closed');
    }
  });

  test('clicking a trigger opens content', async ({ page }) => {
    const trigger = page.locator('[data-accordion-trigger]').first();

    await trigger.click();

    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger).toHaveAttribute('data-state', 'open');

    // Use data attribute selectors instead of IDs — IDs may shift during hydration
    const content = page.locator('[data-accordion-content]').first();
    await expect(content).toHaveAttribute('data-state', 'open');
    await expect(content).toHaveAttribute('aria-hidden', 'false');
    await expect(content).toBeVisible();
    await expect(content).toContainText('WAI-ARIA');
  });

  test('open animation plays when expanding', async ({ page }) => {
    const trigger = page.locator('[data-accordion-trigger]').first();

    // Click and check animation immediately — need to evaluate in the same frame
    const hasAnimation = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const t = document.querySelector('[data-accordion-trigger]') as HTMLElement;
        t.click();
        // Check in next frame — animation should have started
        requestAnimationFrame(() => {
          const content = document.querySelector('[data-accordion-content]');
          resolve(content ? content.getAnimations().length > 0 : false);
        });
      });
    });

    expect(hasAnimation).toBe(true);
  });

  test('close animation plays when collapsing', async ({ page }) => {
    const trigger = page.locator('[data-accordion-trigger]').first();

    // Open first
    await trigger.click();
    // Wait for open animation to complete
    await page.waitForTimeout(300);

    // Close and check animation runs
    const animationInfo = await page.evaluate(() => {
      return new Promise<{
        count: number;
        names: string[];
        display: string;
      }>((resolve) => {
        const t = document.querySelector('[data-accordion-trigger]') as HTMLElement;
        t.click();
        requestAnimationFrame(() => {
          const content = document.querySelector('[data-accordion-content]');
          if (!content) {
            resolve({ count: 0, names: [], display: '' });
            return;
          }
          const animations = content.getAnimations();
          resolve({
            count: animations.length,
            names: animations.map((a) => a.animationName),
            display: (content as HTMLElement).style.display,
          });
        });
      });
    });

    expect(animationInfo.count).toBeGreaterThan(0);
    // Content should still be visible during animation (not display:none)
    expect(animationInfo.display).not.toBe('none');
  });

  test('content is hidden after close animation completes', async ({ page }) => {
    const trigger = page.locator('[data-accordion-trigger]').first();
    const content = page.locator('[data-accordion-content]').first();

    // Open
    await trigger.click();
    await page.waitForTimeout(300);

    // Close and wait for animation to finish
    await trigger.click();
    await page.waitForTimeout(300);

    await expect(content).toHaveAttribute('data-state', 'closed');
    await expect(content).toHaveAttribute('aria-hidden', 'true');
    await expect(content).not.toBeVisible();
  });

  test('--accordion-content-height CSS variable is set during close', async ({ page }) => {
    const trigger = page.locator('[data-accordion-trigger]').first();

    // Open
    await trigger.click();
    await page.waitForTimeout(300);

    // Close and check height variable
    const height = await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const t = document.querySelector('[data-accordion-trigger]') as HTMLElement;
        t.click();
        requestAnimationFrame(() => {
          const content = document.querySelector('[data-accordion-content]') as HTMLElement;
          resolve(content?.style.getPropertyValue('--accordion-content-height') ?? '');
        });
      });
    });

    // Height should be a non-zero px value (the measured scrollHeight before closing)
    expect(height).toMatch(/^\d+px$/);
    expect(height).not.toBe('0px');
  });

  test('single mode: opening one item closes the previously open item', async ({ page }) => {
    const triggers = page.locator('[data-accordion-trigger]');

    // Open first item
    await triggers.nth(0).click();
    await expect(triggers.nth(0)).toHaveAttribute('data-state', 'open');

    // Open second item — first should close
    await triggers.nth(1).click();
    await page.waitForTimeout(300);

    await expect(triggers.nth(1)).toHaveAttribute('data-state', 'open');
    await expect(triggers.nth(0)).toHaveAttribute('data-state', 'closed');
  });

  test('keyboard navigation: arrow keys move focus between triggers', async ({ page }) => {
    const triggers = page.locator('[data-accordion-trigger]');

    // Verify the triggers are interactive by waiting for a successful click.
    // This ensures hydration has completed and event handlers are attached.
    await triggers.nth(0).click();
    await expect(triggers.nth(0)).toHaveAttribute('data-state', 'open');

    // Close it back and wait for animation
    await triggers.nth(0).click();
    await page.waitForTimeout(300);

    // Now focus the first trigger via evaluate on the current DOM element
    await page.evaluate(() => {
      const trigger = document.querySelector('[data-accordion-trigger]') as HTMLElement;
      trigger?.focus();
    });

    // Verify focus took hold
    const focused = await page.evaluate(() => {
      return document.activeElement?.getAttribute('data-accordion-trigger') === '';
    });
    expect(focused).toBe(true);

    // ArrowDown moves to next trigger
    await page.keyboard.press('ArrowDown');
    await expect(triggers.nth(1)).toBeFocused();

    // ArrowDown again
    await page.keyboard.press('ArrowDown');
    await expect(triggers.nth(2)).toBeFocused();

    // ArrowUp moves back
    await page.keyboard.press('ArrowUp');
    await expect(triggers.nth(1)).toBeFocused();
  });
});
