import { describe, expect, test, vi } from 'bun:test';
import { DefaultErrorFallback } from '../default-error-fallback';

describe('DefaultErrorFallback', () => {
  test('displays the error message', () => {
    const error = new Error('Something broke');
    const retry = vi.fn();
    const result = DefaultErrorFallback({ error, retry });
    expect(result.textContent).toContain('Something broke');
  });

  test('displays a heading and retry button', () => {
    const error = new Error('fail');
    const retry = vi.fn();
    const result = DefaultErrorFallback({ error, retry });
    expect(result.textContent).toContain('Something went wrong');
    const btn = result.querySelector('[data-testid="error-retry"]');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe('Try again');
  });

  test('calls retry when the button is clicked', () => {
    const error = new Error('fail');
    const retry = vi.fn();
    const result = DefaultErrorFallback({ error, retry });
    const btn = result.querySelector('[data-testid="error-retry"]') as HTMLButtonElement;
    btn.click();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
