import { describe, expect, it } from 'bun:test';
import type { NativeWindowOptions } from '../window/native-window';

describe('NativeWindowOptions', () => {
  describe('Given window options', () => {
    it('Then has required properties', () => {
      const opts: NativeWindowOptions = {
        title: 'Test Window',
        width: 800,
        height: 600,
      };
      expect(opts.title).toBe('Test Window');
      expect(opts.width).toBe(800);
      expect(opts.height).toBe(600);
    });

    it('Then supports optional properties', () => {
      const opts: NativeWindowOptions = {
        title: 'Test',
        width: 800,
        height: 600,
        resizable: false,
        visible: true,
      };
      expect(opts.resizable).toBe(false);
      expect(opts.visible).toBe(true);
    });
  });
});
