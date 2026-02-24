import { describe, expect, it } from 'bun:test';
import { resolveToken, TokenResolveError } from '../token-resolver';

describe('resolveToken', () => {
  describe('spacing', () => {
    it('resolves p:4 to padding: 1rem', () => {
      const result = resolveToken({ property: 'p', value: '4', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'padding', value: '1rem' }]);
      expect(result.pseudo).toBeNull();
    });

    it('resolves m:2 to margin: 0.5rem', () => {
      const result = resolveToken({ property: 'm', value: '2', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'margin', value: '0.5rem' }]);
    });

    it('resolves px:8 to padding-inline: 2rem', () => {
      const result = resolveToken({ property: 'px', value: '8', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'padding-inline', value: '2rem' }]);
    });

    it('resolves p:0 to padding: 0', () => {
      const result = resolveToken({ property: 'p', value: '0', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'padding', value: '0' }]);
    });

    it('resolves gap:4 to gap: 1rem', () => {
      const result = resolveToken({ property: 'gap', value: '4', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'gap', value: '1rem' }]);
    });

    it('throws on invalid spacing value', () => {
      expect(() => resolveToken({ property: 'p', value: '13', pseudo: null })).toThrow(
        TokenResolveError,
      );
    });
  });

  describe('colors', () => {
    it('resolves bg:background to CSS custom property', () => {
      const result = resolveToken({ property: 'bg', value: 'background', pseudo: null });
      expect(result.declarations).toEqual([
        { property: 'background-color', value: 'var(--color-background)' },
      ]);
    });

    it('resolves bg:primary.700 to CSS custom property with shade', () => {
      const result = resolveToken({ property: 'bg', value: 'primary.700', pseudo: null });
      expect(result.declarations).toEqual([
        { property: 'background-color', value: 'var(--color-primary-700)' },
      ]);
    });

    it('resolves text:foreground', () => {
      const result = resolveToken({ property: 'text', value: 'foreground', pseudo: null });
      expect(result.declarations).toEqual([
        { property: 'color', value: 'var(--color-foreground)' },
      ]);
    });

    it('resolves border:border', () => {
      const result = resolveToken({ property: 'border', value: 'border', pseudo: null });
      expect(result.declarations).toEqual([
        { property: 'border-color', value: 'var(--color-border)' },
      ]);
    });

    it('resolves bg:transparent', () => {
      const result = resolveToken({ property: 'bg', value: 'transparent', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'background-color', value: 'transparent' }]);
    });

    it('resolves bg:surface', () => {
      const result = resolveToken({ property: 'bg', value: 'surface', pseudo: null });
      expect(result.declarations).toEqual([
        { property: 'background-color', value: 'var(--color-surface)' },
      ]);
    });

    it('resolves text:danger.500', () => {
      const result = resolveToken({ property: 'text', value: 'danger.500', pseudo: null });
      expect(result.declarations).toEqual([
        { property: 'color', value: 'var(--color-danger-500)' },
      ]);
    });

    it('resolves bg:gray.100', () => {
      const result = resolveToken({ property: 'bg', value: 'gray.100', pseudo: null });
      expect(result.declarations).toEqual([
        { property: 'background-color', value: 'var(--color-gray-100)' },
      ]);
    });

    it('throws on unknown color token', () => {
      expect(() => resolveToken({ property: 'bg', value: 'potato', pseudo: null })).toThrow(
        TokenResolveError,
      );
    });

    it('throws on unknown color namespace', () => {
      expect(() => resolveToken({ property: 'bg', value: 'potato.500', pseudo: null })).toThrow(
        TokenResolveError,
      );
    });
  });

  describe('border-radius', () => {
    it('resolves rounded:lg to 0.5rem', () => {
      const result = resolveToken({ property: 'rounded', value: 'lg', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'border-radius', value: '0.5rem' }]);
    });

    it('resolves rounded:full to 9999px', () => {
      const result = resolveToken({ property: 'rounded', value: 'full', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'border-radius', value: '9999px' }]);
    });

    it('throws on invalid radius', () => {
      expect(() => resolveToken({ property: 'rounded', value: 'huge', pseudo: null })).toThrow(
        TokenResolveError,
      );
    });
  });

  describe('shadow', () => {
    it('resolves shadow:sm', () => {
      const result = resolveToken({ property: 'shadow', value: 'sm', pseudo: null });
      expect(result.declarations).toEqual([
        { property: 'box-shadow', value: '0 1px 2px 0 rgb(0 0 0 / 0.05)' },
      ]);
    });

    it('resolves shadow:none', () => {
      const result = resolveToken({ property: 'shadow', value: 'none', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'box-shadow', value: 'none' }]);
    });
  });

  describe('display keywords', () => {
    it('resolves flex to display: flex', () => {
      const result = resolveToken({ property: 'flex', value: null, pseudo: null });
      expect(result.declarations).toEqual([{ property: 'display', value: 'flex' }]);
    });

    it('resolves hidden to display: none', () => {
      const result = resolveToken({ property: 'hidden', value: null, pseudo: null });
      expect(result.declarations).toEqual([{ property: 'display', value: 'none' }]);
    });

    it('resolves grid to display: grid', () => {
      const result = resolveToken({ property: 'grid', value: null, pseudo: null });
      expect(result.declarations).toEqual([{ property: 'display', value: 'grid' }]);
    });
  });

  describe('sizing', () => {
    it('resolves w:full to width: 100%', () => {
      const result = resolveToken({ property: 'w', value: 'full', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'width', value: '100%' }]);
    });

    it('resolves w:screen to width: 100vw', () => {
      const result = resolveToken({ property: 'w', value: 'screen', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'width', value: '100vw' }]);
    });

    it('resolves h:screen to height: 100vh (axis-aware)', () => {
      const result = resolveToken({ property: 'h', value: 'screen', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'height', value: '100vh' }]);
    });

    it('resolves min-w:screen to min-width: 100vw', () => {
      const result = resolveToken({ property: 'min-w', value: 'screen', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'min-width', value: '100vw' }]);
    });

    it('resolves max-w:screen to max-width: 100vw', () => {
      const result = resolveToken({ property: 'max-w', value: 'screen', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'max-width', value: '100vw' }]);
    });

    it('resolves min-h:screen to min-height: 100vh', () => {
      const result = resolveToken({ property: 'min-h', value: 'screen', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'min-height', value: '100vh' }]);
    });

    it('resolves max-h:screen to max-height: 100vh', () => {
      const result = resolveToken({ property: 'max-h', value: 'screen', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'max-height', value: '100vh' }]);
    });

    it('resolves w:svw to width: 100svw', () => {
      const result = resolveToken({ property: 'w', value: 'svw', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'width', value: '100svw' }]);
    });

    it('resolves w:dvw to width: 100dvw', () => {
      const result = resolveToken({ property: 'w', value: 'dvw', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'width', value: '100dvw' }]);
    });

    it('resolves w:16 to width from spacing scale', () => {
      const result = resolveToken({ property: 'w', value: '16', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'width', value: '4rem' }]);
    });
  });

  describe('alignment', () => {
    it('resolves items:center', () => {
      const result = resolveToken({ property: 'items', value: 'center', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'align-items', value: 'center' }]);
    });

    it('resolves justify:between', () => {
      const result = resolveToken({ property: 'justify', value: 'between', pseudo: null });
      expect(result.declarations).toEqual([
        { property: 'justify-content', value: 'space-between' },
      ]);
    });
  });

  describe('typography', () => {
    it('resolves font:xl', () => {
      const result = resolveToken({ property: 'font', value: 'xl', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'font-size', value: '1.25rem' }]);
    });

    it('resolves weight:bold', () => {
      const result = resolveToken({ property: 'weight', value: 'bold', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'font-weight', value: '700' }]);
    });

    it('resolves leading:normal', () => {
      const result = resolveToken({ property: 'leading', value: 'normal', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'line-height', value: '1.5' }]);
    });
  });

  describe('pseudo passthrough', () => {
    it('passes through pseudo from parsed shorthand', () => {
      const result = resolveToken({ property: 'bg', value: 'primary', pseudo: ':hover' });
      expect(result.pseudo).toBe(':hover');
      expect(result.declarations).toEqual([
        { property: 'background-color', value: 'var(--color-primary)' },
      ]);
    });
  });

  describe('ring', () => {
    it('resolves ring:2 to outline: 2px solid', () => {
      const result = resolveToken({ property: 'ring', value: '2', pseudo: null });
      expect(result.declarations).toEqual([
        { property: 'outline', value: '2px solid var(--color-ring)' },
      ]);
    });

    it('resolves ring:0 to outline: 0px solid', () => {
      const result = resolveToken({ property: 'ring', value: '0', pseudo: null });
      expect(result.declarations).toEqual([
        { property: 'outline', value: '0px solid var(--color-ring)' },
      ]);
    });

    it('resolves ring:4 to outline: 4px solid', () => {
      const result = resolveToken({ property: 'ring', value: '4', pseudo: null });
      expect(result.declarations).toEqual([
        { property: 'outline', value: '4px solid var(--color-ring)' },
      ]);
    });
  });

  describe('content', () => {
    it('resolves content:empty to content: empty string', () => {
      const result = resolveToken({ property: 'content', value: 'empty', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'content', value: "''" }]);
    });

    it('resolves content:none to content: none', () => {
      const result = resolveToken({ property: 'content', value: 'none', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'content', value: 'none' }]);
    });
  });

  describe('transition', () => {
    it('resolves transition:colors to transition shorthand with per-property timing', () => {
      const result = resolveToken({ property: 'transition', value: 'colors', pseudo: null });
      expect(result.declarations).toHaveLength(1);
      const decl = result.declarations[0];
      expect(decl?.property).toBe('transition');
      // Each property should have its own timing
      expect(decl?.value).toContain('color 150ms');
      expect(decl?.value).toContain('background-color 150ms');
      expect(decl?.value).toContain('border-color 150ms');
    });

    it('resolves transition:all', () => {
      const result = resolveToken({ property: 'transition', value: 'all', pseudo: null });
      expect(result.declarations[0]?.property).toBe('transition');
      expect(result.declarations[0]?.value).toContain('all 150ms');
    });

    it('resolves transition:shadow', () => {
      const result = resolveToken({ property: 'transition', value: 'shadow', pseudo: null });
      expect(result.declarations[0]?.property).toBe('transition');
      expect(result.declarations[0]?.value).toContain('box-shadow 150ms');
    });

    it('resolves transition:none', () => {
      const result = resolveToken({ property: 'transition', value: 'none', pseudo: null });
      expect(result.declarations[0]).toEqual({ property: 'transition', value: 'none' });
    });
  });

  describe('error cases', () => {
    it('throws on unknown property', () => {
      expect(() => resolveToken({ property: 'xyzzy', value: '4', pseudo: null })).toThrow(
        TokenResolveError,
      );
      expect(() => resolveToken({ property: 'xyzzy', value: '4', pseudo: null })).toThrow(
        "Unknown property shorthand 'xyzzy'",
      );
    });

    it('throws when value is required but missing', () => {
      expect(() => resolveToken({ property: 'p', value: null, pseudo: null })).toThrow(
        TokenResolveError,
      );
    });
  });
});
