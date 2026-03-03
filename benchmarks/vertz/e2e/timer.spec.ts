import { test, expect } from '@playwright/test';

test.describe('Timer reactivity', () => {
  test('Timer auto-increments in Dashboard sidebar', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'load' });

    // Vertz compiler renders as "Uptime:<span>N</span>s" → visible text "Uptime:Ns"
    const timerSpan = page.getByText(/Uptime:\s*\d+\s*s/);
    await expect(timerSpan).toBeVisible();

    // Read initial value
    const initialText = await timerSpan.textContent();
    const initialMatch = initialText!.match(/Uptime:\s*(\d+)\s*s/);
    expect(initialMatch).toBeTruthy();
    const initialValue = parseInt(initialMatch![1], 10);

    // Wait for the timer to increment (robust against CI timing)
    await page.waitForFunction(
      (startVal) => {
        const spans = document.querySelectorAll('span');
        for (const s of spans) {
          const match = s.textContent?.match(/Uptime:\s*(\d+)\s*s/);
          if (match && parseInt(match[1], 10) > startVal) return true;
        }
        return false;
      },
      initialValue,
      { timeout: 5000 },
    );
  });
});
