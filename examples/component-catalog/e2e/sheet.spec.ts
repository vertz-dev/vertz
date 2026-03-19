import { expect, test } from '@playwright/test';

test.describe('Sheet', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sheet');
    await page.locator('[data-sheet-trigger]').first().waitFor();
  });

  test('renders sheet triggers', async ({ page }) => {
    const triggers = page.locator('[data-sheet-trigger]');
    await expect(triggers).toHaveCount(2);
  });

  test('clicking trigger opens right sheet', async ({ page }) => {
    await page.locator('[data-sheet-trigger]').first().click();

    const dialog = page.locator('dialog[role="dialog"][data-side="right"]');
    await expect(dialog).toHaveAttribute('data-state', 'open');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Edit profile');
  });

  test('clicking trigger opens left sheet', async ({ page }) => {
    await page.locator('[data-sheet-trigger]').nth(1).click();

    const dialog = page.locator('dialog[role="dialog"][data-side="left"]');
    await expect(dialog).toHaveAttribute('data-state', 'open');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Navigation');
  });

  test('open animation plays when sheet opens', async ({ page }) => {
    // Listen for animationstart before clicking
    const hadAnimation = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        let detected = false;
        document.addEventListener(
          'animationstart',
          (e) => {
            if ((e.target as HTMLElement)?.getAttribute('role') === 'dialog') {
              detected = true;
            }
          },
          { once: true },
        );
        const trigger = document.querySelector('[data-sheet-trigger]') as HTMLElement;
        trigger.click();
        // Resolve after animation would have started (300ms animation)
        setTimeout(() => resolve(detected), 50);
      });
    });

    expect(hadAnimation).toBe(true);
  });

  test('close animation plays for right sheet', async ({ page }) => {
    // Open the sheet
    await page.locator('[data-sheet-trigger]').first().click();
    await page.waitForTimeout(400);

    // Close via the close button and check animation
    const animationInfo = await page.evaluate(() => {
      return new Promise<{
        count: number;
        names: string[];
        dialogStillOpen: boolean;
      }>((resolve) => {
        const closeBtn = document.querySelector('dialog[role="dialog"] [data-slot="sheet-close"]') as HTMLElement;
        closeBtn.click();
        requestAnimationFrame(() => {
          const dialog = document.querySelector('dialog[role="dialog"][data-side="right"]') as HTMLDialogElement;
          if (!dialog) {
            resolve({ count: 0, names: [], dialogStillOpen: false });
            return;
          }
          const animations = dialog.getAnimations();
          resolve({
            count: animations.length,
            names: animations.map((a) => a.animationName),
            dialogStillOpen: dialog.open,
          });
        });
      });
    });

    expect(animationInfo.count).toBeGreaterThan(0);
    expect(animationInfo.names).toContain('vz-slide-out-to-right');
    // Sheet should still be open during animation (not instantly removed)
    expect(animationInfo.dialogStillOpen).toBe(true);
  });

  test('close animation plays for left sheet', async ({ page }) => {
    // Open the left sheet
    await page.locator('[data-sheet-trigger]').nth(1).click();
    await page.waitForTimeout(400);

    // Close via the close button and check animation
    const animationInfo = await page.evaluate(() => {
      return new Promise<{
        count: number;
        names: string[];
        dialogStillOpen: boolean;
      }>((resolve) => {
        const closeBtn = document.querySelector('dialog[role="dialog"][data-side="left"] [data-slot="sheet-close"]') as HTMLElement;
        closeBtn.click();
        requestAnimationFrame(() => {
          const dialog = document.querySelector('dialog[role="dialog"][data-side="left"]') as HTMLDialogElement;
          if (!dialog) {
            resolve({ count: 0, names: [], dialogStillOpen: false });
            return;
          }
          const animations = dialog.getAnimations();
          resolve({
            count: animations.length,
            names: animations.map((a) => a.animationName),
            dialogStillOpen: dialog.open,
          });
        });
      });
    });

    expect(animationInfo.count).toBeGreaterThan(0);
    expect(animationInfo.names).toContain('vz-slide-out-to-left');
    expect(animationInfo.dialogStillOpen).toBe(true);
  });

  test('sheet is hidden after close animation completes', async ({ page }) => {
    // Open the sheet
    await page.locator('[data-sheet-trigger]').first().click();
    await page.waitForTimeout(400);

    // Close via the close button on the open sheet
    const closeBtn = page.locator('dialog[role="dialog"][data-state="open"] [data-slot="sheet-close"]');
    await closeBtn.click();
    await page.waitForTimeout(500);

    await expect(page.locator('dialog[role="dialog"][data-state="open"]')).toHaveCount(0);
  });

  test('Escape key closes sheet with animation', async ({ page }) => {
    // Open the sheet
    await page.locator('[data-sheet-trigger]').first().click();
    await page.waitForTimeout(400);

    // Press Escape and check animation
    const animationInfo = await page.evaluate(() => {
      return new Promise<{
        count: number;
        names: string[];
      }>((resolve) => {
        const dialog = document.querySelector('dialog[role="dialog"]') as HTMLDialogElement;
        dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        // The cancel event is what actually triggers close
        dialog.dispatchEvent(new Event('cancel', { bubbles: false }));
        requestAnimationFrame(() => {
          const animations = dialog.getAnimations();
          resolve({
            count: animations.length,
            names: animations.map((a) => a.animationName),
          });
        });
      });
    });

    expect(animationInfo.count).toBeGreaterThan(0);
    expect(animationInfo.names).toContain('vz-slide-out-to-right');
  });

  test('clicking backdrop closes sheet', async ({ page }) => {
    // Open the sheet
    await page.locator('[data-sheet-trigger]').first().click();
    await page.waitForTimeout(400);

    // Click the dialog element itself (backdrop area — left side for right sheet)
    const dialog = page.locator('dialog[role="dialog"][data-side="right"]');
    const box = await dialog.boundingBox();
    if (box) {
      // Click left edge of the dialog (backdrop area)
      await page.mouse.click(box.x + 2, box.y + box.height / 2);
    }
    await page.waitForTimeout(500);

    await expect(dialog).toHaveAttribute('data-state', 'closed');
  });
});
