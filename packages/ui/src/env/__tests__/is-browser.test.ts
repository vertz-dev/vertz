import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { registerSSRResolver } from '../../ssr/ssr-render-context';
import { isBrowser } from '../is-browser';

describe('Feature: isBrowser()', () => {
  let savedWindow: typeof globalThis.window;

  beforeEach(() => {
    savedWindow = globalThis.window;
  });

  afterEach(() => {
    if (savedWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = savedWindow;
    }
    registerSSRResolver(null);
  });

  describe('Given no SSR resolver registered and window is defined', () => {
    it('Then returns true (real browser)', () => {
      (globalThis as any).window = { location: { pathname: '/' } };
      registerSSRResolver(null);
      expect(isBrowser()).toBe(true);
    });
  });

  describe('Given an SSR resolver is registered (server environment)', () => {
    it('Then returns false even when resolver returns a context', () => {
      (globalThis as any).window = { location: { pathname: '/' } };
      const fakeCtx = { url: '/' } as any;
      registerSSRResolver(() => fakeCtx);
      expect(typeof window).toBe('object');
      expect(isBrowser()).toBe(false);
    });

    it('Then returns false even when resolver returns undefined (outside ssrStorage.run)', () => {
      // This is the HMR re-import scenario: createRouter() re-evaluates
      // at module scope on the server, outside any SSR render context.
      (globalThis as any).window = { location: { pathname: '/' } };
      registerSSRResolver(() => undefined);
      expect(isBrowser()).toBe(false);
    });
  });

  describe('Given window is undefined (no DOM shim, no browser)', () => {
    it('Then returns false', () => {
      delete (globalThis as any).window;
      expect(isBrowser()).toBe(false);
    });
  });

  describe('Given window exists but no SSR resolver registered', () => {
    it('Then returns true (DOM shim gap is acceptable without resolver)', () => {
      (globalThis as any).window = { location: { pathname: '/' } };
      registerSSRResolver(null);
      expect(isBrowser()).toBe(true);
    });
  });
});
