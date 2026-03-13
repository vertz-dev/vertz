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
      // biome-ignore lint/performance/noDelete: test requires removing window global
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = savedWindow;
    }
    registerSSRResolver(null);
  });

  describe('Given no SSR context is active and window is defined', () => {
    it('Then returns true', () => {
      (globalThis as any).window = { location: { pathname: '/' } };
      registerSSRResolver(null);
      expect(isBrowser()).toBe(true);
    });
  });

  describe('Given an SSR context is active (inside SSR render)', () => {
    it('Then returns false even though window is defined', () => {
      (globalThis as any).window = { location: { pathname: '/' } };
      const fakeCtx = { url: '/' } as any;
      registerSSRResolver(() => fakeCtx);
      expect(typeof window).toBe('object');
      expect(isBrowser()).toBe(false);
    });
  });

  describe('Given window is undefined (no DOM shim, no browser)', () => {
    it('Then returns false', () => {
      // biome-ignore lint/performance/noDelete: test requires removing window global
      delete (globalThis as any).window;
      expect(isBrowser()).toBe(false);
    });
  });

  describe('Given DOM shim is installed but no SSR context is active', () => {
    it('Then returns true (gap between installDomShim and ssrStorage.run)', () => {
      (globalThis as any).window = { location: { pathname: '/' } };
      registerSSRResolver(null);
      expect(isBrowser()).toBe(true);
    });
  });
});
