import { expect, test } from '@playwright/test';

test.describe('Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dialog');
    // Wait for first trigger button to be ready
    await page.locator('[data-dialog-trigger]').first().waitFor();
  });

  test('renders dialog triggers', async ({ page }) => {
    const triggers = page.locator('[data-dialog-trigger]');
    await expect(triggers).toHaveCount(3);
  });

  test('clicking trigger opens dialog', async ({ page }) => {
    const trigger = page.locator('[data-dialog-trigger]').first();
    await trigger.click();

    const dialog = page.locator('dialog[role="dialog"][data-state="open"]');
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toBeVisible();
  });

  test('dialog content is visible when open', async ({ page }) => {
    await page.locator('[data-dialog-trigger]').first().click();

    const dialog = page.locator('dialog[role="dialog"][data-state="open"]');
    await expect(dialog).toContainText('Edit profile');
    await expect(dialog).toContainText('Make changes to your profile');
  });

  test('open animation plays when dialog opens', async ({ page }) => {
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
        const trigger = document.querySelector('[data-dialog-trigger]') as HTMLElement;
        trigger.click();
        // Resolve after animation would have started (100ms animation)
        setTimeout(() => resolve(detected), 50);
      });
    });

    expect(hadAnimation).toBe(true);
  });

  test('close animation plays when dialog closes', async ({ page }) => {
    // Open the dialog
    await page.locator('[data-dialog-trigger]').first().click();
    await page.waitForTimeout(200);

    // Close via the close button and check animation
    const animationInfo = await page.evaluate(() => {
      return new Promise<{
        count: number;
        names: string[];
        dialogStillOpen: boolean;
      }>((resolve) => {
        const dialog = document.querySelector('dialog[role="dialog"][data-state="open"]') as HTMLDialogElement;
        const closeBtn = dialog.querySelector('[data-slot="dialog-close"]') as HTMLElement;
        closeBtn.click();
        requestAnimationFrame(() => {
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
    expect(animationInfo.names).toContain('vz-zoom-out');
    // Dialog should still be open during animation (not instantly removed)
    expect(animationInfo.dialogStillOpen).toBe(true);
  });

  test('dialog is hidden after close animation completes', async ({ page }) => {
    // Open the dialog
    await page.locator('[data-dialog-trigger]').first().click();
    await page.waitForTimeout(200);

    // Close via the close button on the open dialog
    const closeBtn = page.locator('dialog[role="dialog"][data-state="open"] [data-slot="dialog-close"]');
    await closeBtn.click();
    await page.waitForTimeout(300);

    // All dialogs should be closed now
    await expect(page.locator('dialog[role="dialog"][data-state="open"]')).toHaveCount(0);
  });

  test('Escape key closes dialog with animation', async ({ page }) => {
    // Open the dialog
    await page.locator('[data-dialog-trigger]').first().click();
    await page.waitForTimeout(200);

    // Press Escape and check animation
    const animationInfo = await page.evaluate(() => {
      return new Promise<{
        count: number;
        names: string[];
      }>((resolve) => {
        const dialog = document.querySelector('dialog[role="dialog"][data-state="open"]') as HTMLDialogElement;
        dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        dialog.dispatchEvent(new Event('cancel', { bubbles: false }));
        requestAnimationFrame(() => {
          if (!dialog) {
            resolve({ count: 0, names: [] });
            return;
          }
          const animations = dialog.getAnimations();
          resolve({
            count: animations.length,
            names: animations.map((a) => a.animationName),
          });
        });
      });
    });

    expect(animationInfo.count).toBeGreaterThan(0);
    expect(animationInfo.names).toContain('vz-zoom-out');
  });

  test('clicking backdrop closes dialog', async ({ page }) => {
    // Open the dialog
    await page.locator('[data-dialog-trigger]').first().click();
    await page.waitForTimeout(200);

    // Click the dialog element itself (backdrop area)
    const dialog = page.locator('dialog[role="dialog"][data-state="open"]');
    // Click at the edge of the dialog (backdrop) — bounding box top-left corner
    const box = await dialog.boundingBox();
    if (box) {
      await page.mouse.click(box.x + 2, box.y + 2);
    }
    await page.waitForTimeout(300);

    await expect(page.locator('dialog[role="dialog"][data-state="open"]')).toHaveCount(0);
  });
});
