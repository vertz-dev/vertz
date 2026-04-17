import { describe, expect, it, mock, vi } from '@vertz/test';

// User-facing verification for vitest-compatible mock APIs added in this PR.
// The runtime-level tests live in native/vtz/src/test/globals.rs — these tests
// exercise the same surface via the `@vertz/test` public import so we can catch
// wiring regressions (e.g. methods dropped from the module bridge).

describe('mock() getMockImplementation', () => {
  it('returns undefined for a bare mock with no impl', () => {
    const fn = mock();
    expect(fn.getMockImplementation()).toBeUndefined();
  });

  it('returns the initial implementation passed to mock()', () => {
    const impl = (x: unknown) => x;
    const fn = mock(impl);
    expect(fn.getMockImplementation()).toBe(impl);
  });

  it('reflects the most recent mockImplementation()', () => {
    const fn = mock();
    const impl1 = () => 'one';
    const impl2 = () => 'two';
    fn.mockImplementation(impl1);
    expect(fn.getMockImplementation()).toBe(impl1);
    fn.mockImplementation(impl2);
    expect(fn.getMockImplementation()).toBe(impl2);
  });

  it('returns undefined after mockReset()', () => {
    const fn = mock(() => 42);
    fn.mockReset();
    expect(fn.getMockImplementation()).toBeUndefined();
  });

  it('is exposed on vi.fn() mocks too', () => {
    const fn = vi.fn(() => 7);
    const impl = fn.getMockImplementation();
    expect(typeof impl).toBe('function');
    expect(impl?.()).toBe(7);
  });
});

describe('mock() getMockName / mockName', () => {
  it('defaults to empty string', () => {
    const fn = mock();
    expect(fn.getMockName()).toBe('');
  });

  it('round-trips via mockName()', () => {
    const fn = mock();
    fn.mockName('myMock');
    expect(fn.getMockName()).toBe('myMock');
  });

  it('mockName() returns the mock for chaining', () => {
    const fn = mock();
    const same = fn.mockName('x');
    expect(same).toBe(fn);
  });

  it('mockReset clears the name', () => {
    const fn = mock();
    fn.mockName('temp');
    fn.mockReset();
    expect(fn.getMockName()).toBe('');
  });

  it('mockClear preserves the name', () => {
    const fn = mock();
    fn.mockName('keep-me');
    fn.mockClear();
    expect(fn.getMockName()).toBe('keep-me');
  });
});

describe('mock() withImplementation', () => {
  it('runs cb with the temp impl and restores afterwards', () => {
    const fn = mock(() => 'original');
    const result = fn.withImplementation(
      () => 'temp',
      () => fn(),
    );
    expect(result).toBe('temp');
    expect(fn()).toBe('original');
  });

  it('restores when cb throws', () => {
    const fn = mock(() => 'original');
    let caught = false;
    try {
      fn.withImplementation(
        () => 'temp',
        () => {
          throw new Error('boom');
        },
      );
    } catch (e) {
      caught = true;
      expect((e as Error).message).toBe('boom');
    }
    expect(caught).toBe(true);
    expect(fn()).toBe('original');
  });

  it('awaits async cb and restores after resolution', async () => {
    const fn = mock(() => 'original');
    const result = await fn.withImplementation(
      () => 'temp',
      async () => fn(),
    );
    expect(result).toBe('temp');
    expect(fn()).toBe('original');
  });

  it('restores after async cb rejection', async () => {
    const fn = mock(() => 'original');
    let caught = false;
    try {
      await fn.withImplementation(
        () => 'temp',
        async () => {
          throw new Error('async-boom');
        },
      );
    } catch (e) {
      caught = true;
      expect((e as Error).message).toBe('async-boom');
    }
    expect(caught).toBe(true);
    expect(fn()).toBe('original');
  });

  it('leaves getMockImplementation unchanged after return', () => {
    const originalImpl = () => 'original';
    const fn = mock(originalImpl);
    fn.withImplementation(
      () => 'temp',
      () => fn(),
    );
    expect(fn.getMockImplementation()).toBe(originalImpl);
  });
});
