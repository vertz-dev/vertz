import { expect, test } from '@playwright/test';

test.describe('Popover', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/popover');
    await page.locator('[data-popover-trigger]').waitFor();
  });

  test('renders trigger button', async ({ page }) => {
    const trigger = page.locator('[data-popover-trigger]');
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText('Open popover');
  });

  test('content is hidden initially', async ({ page }) => {
    const content = page.locator('[data-popover-content]');
    await expect(content).not.toBeVisible();
    await expect(content).toHaveAttribute('aria-hidden', 'true');
    await expect(content).toHaveAttribute('data-state', 'closed');
  });

  test('clicking trigger opens the popover', async ({ page }) => {
    const trigger = page.locator('[data-popover-trigger]');
    await trigger.click();

    const content = page.locator('[data-popover-content]');
    await expect(content).toBeVisible();
    await expect(content).toHaveAttribute('aria-hidden', 'false');
    await expect(content).toHaveAttribute('data-state', 'open');
    await expect(content).toContainText('Dimensions');
  });

  test('popover positions near the trigger, not at page origin', async ({ page }) => {
    const trigger = page.locator('[data-popover-trigger]');
    await trigger.click();

    const content = page.locator('[data-popover-content]');
    await expect(content).toBeVisible();

    // The trigger wrapper uses display:contents — get the button inside for positioning
    const triggerButton = page.locator('[data-popover-trigger] button');
    const triggerBox = await triggerButton.boundingBox();
    const contentBox = await content.boundingBox();

    expect(triggerBox).not.toBeNull();
    expect(contentBox).not.toBeNull();

    // Content should be near the trigger — not at (0, 0) or far away.
    const triggerCenterX = triggerBox!.x + triggerBox!.width / 2;
    const contentCenterX = contentBox!.x + contentBox!.width / 2;

    // Horizontal: content center should be within 200px of trigger center
    expect(Math.abs(contentCenterX - triggerCenterX)).toBeLessThan(200);

    // Vertical: content should be near trigger (above or below)
    const triggerBottom = triggerBox!.y + triggerBox!.height;
    const distance = Math.min(
      Math.abs(contentBox!.y - triggerBottom), // below trigger
      Math.abs(contentBox!.y + contentBox!.height - triggerBox!.y), // above trigger
    );
    expect(distance).toBeLessThan(300);

    // Definitely not at (0, 0) — the bug we fixed
    expect(contentBox!.x + contentBox!.y).toBeGreaterThan(50);
  });

  test('clicking outside the popover dismisses it', async ({ page }) => {
    const trigger = page.locator('[data-popover-trigger]');
    await trigger.click();

    const content = page.locator('[data-popover-content]');
    await expect(content).toBeVisible();

    // Click outside (on the page body, away from content)
    await page.mouse.click(10, 10);

    await expect(content).not.toBeVisible();
    await expect(content).toHaveAttribute('data-state', 'closed');
  });

  test('pressing Escape dismisses the popover', async ({ page }) => {
    const trigger = page.locator('[data-popover-trigger]');
    await trigger.click();

    const content = page.locator('[data-popover-content]');
    await expect(content).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(content).not.toBeVisible();
    await expect(content).toHaveAttribute('data-state', 'closed');
  });

  test('clicking trigger again closes the popover', async ({ page }) => {
    const trigger = page.locator('[data-popover-trigger]');

    // Open
    await trigger.click();
    const content = page.locator('[data-popover-content]');
    await expect(content).toBeVisible();

    // Close
    await trigger.click();
    await expect(content).not.toBeVisible();
  });
});
