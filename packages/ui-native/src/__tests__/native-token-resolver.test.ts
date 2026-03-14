import { describe, expect, it } from 'bun:test';
import {
  createNativeTokenResolver,
  defaultDarkTheme,
  type NativeTheme,
} from '../css/native-token-resolver';

describe('NativeTokenResolver', () => {
  const resolver = createNativeTokenResolver(defaultDarkTheme);

  describe('Given spacing tokens', () => {
    it('Then resolves p:4 to 16 pixels', () => {
      const result = resolver.resolve('p', '4');
      expect(result).toEqual({ padding: 16 });
    });

    it('Then resolves p:2 to 8 pixels', () => {
      const result = resolver.resolve('p', '2');
      expect(result).toEqual({ padding: 8 });
    });

    it('Then resolves px:3 to horizontal padding', () => {
      const result = resolver.resolve('px', '3');
      expect(result).toEqual({ paddingLeft: 12, paddingRight: 12 });
    });

    it('Then resolves gap:6 to 24 pixels', () => {
      const result = resolver.resolve('gap', '6');
      expect(result).toEqual({ gap: 24 });
    });

    it('Then resolves m:4 to 16 pixels', () => {
      const result = resolver.resolve('m', '4');
      expect(result).toEqual({ margin: 16 });
    });
  });

  describe('Given color tokens', () => {
    it('Then resolves bg with a hex color to RGBA', () => {
      const result = resolver.resolve('bg', '#ff0000');
      expect(result).toEqual({ backgroundColor: [1, 0, 0, 1] });
    });

    it('Then resolves bg:transparent to [0,0,0,0]', () => {
      const result = resolver.resolve('bg', 'transparent');
      expect(result).toEqual({ backgroundColor: [0, 0, 0, 0] });
    });

    it('Then resolves bg with theme color namespace', () => {
      const result = resolver.resolve('bg', 'primary.600');
      expect(result).toHaveProperty('backgroundColor');
      const color = result.backgroundColor as number[];
      expect(color).toHaveLength(4);
      // Should be a valid RGBA color
      for (const c of color) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    });

    it('Then resolves text with theme color', () => {
      const result = resolver.resolve('text', 'foreground');
      expect(result).toHaveProperty('color');
    });
  });

  describe('Given radius tokens', () => {
    it('Then resolves rounded:lg to pixels', () => {
      const result = resolver.resolve('rounded', 'lg');
      expect(result).toEqual({ borderRadius: 8 });
    });

    it('Then resolves rounded:md to pixels', () => {
      const result = resolver.resolve('rounded', 'md');
      expect(result).toEqual({ borderRadius: 6 });
    });

    it('Then resolves rounded:full to large value', () => {
      const result = resolver.resolve('rounded', 'full');
      expect(result).toEqual({ borderRadius: 9999 });
    });

    it('Then resolves rounded:none to 0', () => {
      const result = resolver.resolve('rounded', 'none');
      expect(result).toEqual({ borderRadius: 0 });
    });
  });

  describe('Given font-size tokens', () => {
    it('Then resolves font:sm to pixels', () => {
      const result = resolver.resolve('font', 'sm');
      expect(result).toEqual({ fontSize: 14 });
    });

    it('Then resolves font:lg to pixels', () => {
      const result = resolver.resolve('font', 'lg');
      expect(result).toEqual({ fontSize: 18 });
    });

    it('Then resolves font:base to 16 pixels', () => {
      const result = resolver.resolve('font', 'base');
      expect(result).toEqual({ fontSize: 16 });
    });
  });

  describe('Given font-weight tokens', () => {
    it('Then resolves weight:bold to 700', () => {
      const result = resolver.resolve('weight', 'bold');
      expect(result).toEqual({ fontWeight: 700 });
    });

    it('Then resolves weight:semibold to 600', () => {
      const result = resolver.resolve('weight', 'semibold');
      expect(result).toEqual({ fontWeight: 600 });
    });
  });

  describe('Given size tokens', () => {
    it('Then resolves w with spacing number to pixels', () => {
      const result = resolver.resolve('w', '16');
      expect(result).toEqual({ width: 64 });
    });

    it('Then resolves h with spacing number to pixels', () => {
      const result = resolver.resolve('h', '10');
      expect(result).toEqual({ height: 40 });
    });
  });

  describe('Given a custom theme', () => {
    it('Then uses the custom theme colors', () => {
      const customTheme: NativeTheme = {
        colors: {
          primary: { 600: [0.2, 0.4, 0.8, 1] },
          foreground: { DEFAULT: [1, 1, 1, 1] },
        },
        baseFontSize: 16,
      };
      const customResolver = createNativeTokenResolver(customTheme);
      const result = customResolver.resolve('bg', 'primary.600');
      expect(result).toEqual({ backgroundColor: [0.2, 0.4, 0.8, 1] });
    });
  });
});
