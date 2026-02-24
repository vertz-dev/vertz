import { describe, expect, test } from 'bun:test';
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
