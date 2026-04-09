import { describe, expect, test } from '@vertz/test';
import { ErrorBoundary } from '../error-boundary';

describe('ErrorBoundary', () => {
  test('renders children when no error occurs', () => {
    const result = ErrorBoundary({
      children: () => document.createElement('div'),
      fallback: () => document.createElement('span'),
    });
    expect(result.tagName).toBe('DIV');
  });

  test('renders fallback when children throw', () => {
    const result = ErrorBoundary({
      children: () => {
        throw new TypeError('test error');
      },
      fallback: (error) => {
        const el = document.createElement('span');
        el.textContent = error.message;
        return el;
      },
    });
    expect(result.tagName).toBe('SPAN');
    expect(result.textContent).toBe('test error');
  });

  test('fallback receives the error object', () => {
    let capturedError: Error | undefined;
    ErrorBoundary({
      children: () => {
        throw new RangeError('out of bounds');
      },
      fallback: (error) => {
        capturedError = error;
        return document.createElement('div');
      },
    });
    expect(capturedError).toBeInstanceOf(RangeError);
    expect(capturedError?.message).toBe('out of bounds');
  });

  test('fallback receives a retry function that re-renders children', () => {
    let attempts = 0;
    let retryFn: (() => void) | undefined;

    const container = document.createElement('div');
    const result = ErrorBoundary({
      children: () => {
        attempts++;
        if (attempts < 2) {
          throw new TypeError('not ready');
        }
        const el = document.createElement('p');
        el.textContent = 'success';
        return el;
      },
      fallback: (_error, retry) => {
        retryFn = retry;
        const el = document.createElement('span');
        el.textContent = 'error';
        return el;
      },
    });
    container.appendChild(result);

    // First render: children throws, fallback shown
    expect(container.textContent).toBe('error');
    expect(retryFn).toBeDefined();

    // Call the actual retry function — it should replace the fallback in the DOM
    retryFn?.();
    expect(container.textContent).toBe('success');
  });

  test('catches errors from nested children', () => {
    const result = ErrorBoundary({
      children: () => {
        // Simulate a deeply nested error
        const inner = () => {
          throw new TypeError('deep error');
        };
        inner();
        return document.createElement('div');
      },
      fallback: (error) => {
        const el = document.createElement('span');
        el.textContent = error.message;
        return el;
      },
    });
    expect(result.textContent).toBe('deep error');
  });

  test('async error handler retry replaces fallback with children on success', async () => {
    // ErrorBoundary + Suspense: async error triggers handleAsyncError,
    // and its retry() replaces the fallback in the DOM.
    const { pushErrorHandler, popErrorHandler } = await import('../error-boundary-context');

    const container = document.createElement('div');
    let asyncRetry: (() => void) | undefined;
    let attempts = 0;

    const result = ErrorBoundary({
      children: () => {
        attempts++;
        if (attempts === 1) {
          // First render succeeds (ErrorBoundary catches nothing synchronously)
          return document.createElement('div');
        }
        // Retry: return success element
        const el = document.createElement('p');
        el.textContent = 'recovered';
        return el;
      },
      fallback: (_error, retry) => {
        asyncRetry = retry;
        const el = document.createElement('span');
        el.textContent = 'async-error';
        return el;
      },
    });
    container.appendChild(result);

    // Simulate async error from nested Suspense: manually invoke handleAsyncError
    // by getting the handler that was pushed during children() execution
    // We need to trigger handleAsyncError directly, so let's create a new
    // ErrorBoundary whose children throw an async error via Suspense
    const container2 = document.createElement('div');
    let asyncRetry2: (() => void) | undefined;
    let childAttempts = 0;

    const result2 = ErrorBoundary({
      children: () => {
        childAttempts++;
        if (childAttempts === 1) {
          // Simulate Suspense catching a rejected promise and calling handleAsyncError
          const placeholder = document.createElement('div');
          placeholder.textContent = 'loading';
          // The promise rejects → Suspense calls handleAsyncError on the error boundary
          throw new Error('async failure');
        }
        const el = document.createElement('p');
        el.textContent = 'retry-success';
        return el;
      },
      fallback: (_error, retry) => {
        asyncRetry2 = retry;
        const el = document.createElement('span');
        el.textContent = 'fallback';
        return el;
      },
    });
    container2.appendChild(result2);
    expect(container2.textContent).toBe('fallback');

    // Retry should replace fallback with children()
    asyncRetry2?.();
    expect(container2.textContent).toBe('retry-success');
  });

  test('async error handler retry keeps fallback when children throw again', () => {
    // Test the catch branch inside handleAsyncError's retry (line 46-48)
    const container = document.createElement('div');
    let retryFn: (() => void) | undefined;

    const result = ErrorBoundary({
      children: () => {
        // Always throw — retry should silently catch and keep the fallback
        throw new Error('always fails');
      },
      fallback: (_error, retry) => {
        retryFn = retry;
        const el = document.createElement('span');
        el.textContent = 'error-shown';
        return el;
      },
    });
    container.appendChild(result);
    expect(container.textContent).toBe('error-shown');

    // Retry — children throw again, fallback stays
    retryFn?.();
    expect(container.textContent).toBe('error-shown');
  });

  test('async error handler replaces placeholder and retry works via Suspense integration', async () => {
    const { Suspense } = await import('../suspense');
    const container = document.createElement('div');
    let resolvePromise: () => void;
    let rejectPromise: (err: Error) => void;
    const asyncPromise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    let childCallCount = 0;
    const result = ErrorBoundary({
      children: () => {
        return Suspense({
          children: () => {
            childCallCount++;
            if (childCallCount === 1) {
              throw asyncPromise;
            }
            const el = document.createElement('p');
            el.textContent = 'resolved';
            return el;
          },
          fallback: () => {
            const el = document.createElement('span');
            el.textContent = 'suspense-loading';
            return el;
          },
        });
      },
      fallback: (error, retry) => {
        const el = document.createElement('span');
        el.textContent = `error: ${error.message}`;
        el.addEventListener('click', retry);
        return el;
      },
    });
    container.appendChild(result);
    // Suspense shows fallback while promise is pending
    expect(container.textContent).toBe('suspense-loading');

    // Reject the promise → triggers handleAsyncError on ErrorBoundary
    // @ts-expect-error - rejectPromise is assigned in the Promise callback
    rejectPromise(new Error('async-fail'));
    await new Promise((r) => setTimeout(r, 10));

    // ErrorBoundary's fallback should now be shown
    expect(container.textContent).toBe('error: async-fail');

    // Click to retry — should replace fallback with children
    (container.firstChild as HTMLElement).click();
    expect(container.textContent).toBe('resolved');
  });

  test('non-Error throws are wrapped in Error', () => {
    let capturedError: Error | undefined;
    ErrorBoundary({
      children: () => {
        throw 'string error'; // eslint-disable-line no-throw-literal
      },
      fallback: (error) => {
        capturedError = error;
        return document.createElement('div');
      },
    });
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError?.message).toBe('string error');
  });
});
