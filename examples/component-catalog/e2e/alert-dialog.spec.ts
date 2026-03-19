import { expect, test } from '@playwright/test';

test.describe('AlertDialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/alert-dialog');
    await page.locator('[data-alertdialog-trigger]').first().waitFor();
  });

  test('renders alert dialog trigger', async ({ page }) => {
    const trigger = page.locator('[data-alertdialog-trigger]');
    await expect(trigger).toHaveCount(1);
    await expect(trigger).toContainText('Delete Account');
  });

  test('clicking trigger opens alert dialog', async ({ page }) => {
    await page.locator('[data-alertdialog-trigger]').click();

    const dialog = page.locator('dialog[role="alertdialog"]');
    await expect(dialog).toHaveAttribute('data-state', 'open');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Are you absolutely sure?');
    await expect(dialog).toContainText('This action cannot be undone');
  });

  test('open animation plays when alert dialog opens', async ({ page }) => {
    // Listen for animationstart before clicking, using capture for earliest detection
    const hadAnimation = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        let detected = false;
        document.addEventListener(
          'animationstart',
          (e) => {
            if ((e.target as HTMLElement)?.getAttribute('role') === 'alertdialog') {
              detected = true;
            }
          },
          { capture: true },
        );
        const trigger = document.querySelector('[data-alertdialog-trigger]') as HTMLElement;
        trigger.click();
        // Resolve after animation would have started (100ms animation duration)
        setTimeout(() => resolve(detected), 150);
      });
    });

    expect(hadAnimation).toBe(true);
  });

  test('close animation plays when Cancel is clicked', async ({ page }) => {
    // Open the alert dialog
    await page.locator('[data-alertdialog-trigger]').click();
    await page.waitForTimeout(200);

    // Click Cancel and check animation
    const animationInfo = await page.evaluate(() => {
      return new Promise<{
        count: number;
        names: string[];
        dialogStillOpen: boolean;
      }>((resolve) => {
        const cancelBtn = document.querySelector('[data-slot="alertdialog-cancel"]') as HTMLElement;
        cancelBtn.click();
        requestAnimationFrame(() => {
          const dialog = document.querySelector('dialog[role="alertdialog"]') as HTMLDialogElement;
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

  test('close animation plays when Action is clicked', async ({ page }) => {
    // Open the alert dialog
    await page.locator('[data-alertdialog-trigger]').click();
    await page.waitForTimeout(200);

    // Click the Action button (Continue)
    const animationInfo = await page.evaluate(() => {
      return new Promise<{
        count: number;
        names: string[];
        dialogStillOpen: boolean;
      }>((resolve) => {
        const actionBtn = document.querySelector('[data-slot="alertdialog-action"]') as HTMLElement;
        actionBtn.click();
        requestAnimationFrame(() => {
          const dialog = document.querySelector('dialog[role="alertdialog"]') as HTMLDialogElement;
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
    expect(animationInfo.dialogStillOpen).toBe(true);
  });

  test('alert dialog is hidden after close animation completes', async ({ page }) => {
    // Open the alert dialog
    await page.locator('[data-alertdialog-trigger]').click();
    await page.waitForTimeout(200);

    // Cancel and wait for animation to finish
    await page.locator('[data-slot="alertdialog-cancel"]').click();
    await page.waitForTimeout(300);

    const dialog = page.locator('dialog[role="alertdialog"]');
    await expect(dialog).toHaveAttribute('data-state', 'closed');
    await expect(dialog).not.toBeVisible();
  });

  test('Escape does NOT close alert dialog', async ({ page }) => {
    // Open the alert dialog
    await page.locator('[data-alertdialog-trigger]').click();
    await page.waitForTimeout(200);

    // Press Escape — alert dialog should block it
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Should still be open
    const dialog = page.locator('dialog[role="alertdialog"]');
    await expect(dialog).toHaveAttribute('data-state', 'open');
    await expect(dialog).toBeVisible();
  });

  test('Cancel and Action buttons are rendered', async ({ page }) => {
    await page.locator('[data-alertdialog-trigger]').click();

    const cancel = page.locator('[data-slot="alertdialog-cancel"]');
    const action = page.locator('[data-slot="alertdialog-action"]');

    await expect(cancel).toBeVisible();
    await expect(cancel).toHaveText('Cancel');
    await expect(action).toBeVisible();
    await expect(action).toHaveText('Continue');
  });
});
