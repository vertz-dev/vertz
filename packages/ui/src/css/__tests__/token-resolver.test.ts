import { describe, expect, it } from '@vertz/test';
import { isValidColorToken, resolveToken, TokenResolveError } from '../token-resolver';

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

    it('resolves text:primary-foreground to compound namespace', () => {
      const result = resolveToken({
        property: 'text',
        value: 'primary-foreground',
        pseudo: null,
      });
      expect(result.declarations).toEqual([
        { property: 'color', value: 'var(--color-primary-foreground)' },
      ]);
    });

    it('resolves bg:muted-foreground to compound namespace', () => {
      const result = resolveToken({
        property: 'bg',
        value: 'muted-foreground',
        pseudo: null,
      });
      expect(result.declarations).toEqual([
        { property: 'background-color', value: 'var(--color-muted-foreground)' },
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
    it('resolves rounded:lg to calc expression based on --radius', () => {
      const result = resolveToken({ property: 'rounded', value: 'lg', pseudo: null });
      expect(result.declarations).toEqual([
        { property: 'border-radius', value: 'calc(var(--radius) * 1.33)' },
      ]);
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

  describe('fraction dimensions', () => {
    it('resolves w:1/2 to width: 50%', () => {
      const result = resolveToken({ property: 'w', value: '1/2', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'width', value: '50%' }]);
    });

    it('resolves w:1/3 to width: 33.333333%', () => {
      const result = resolveToken({ property: 'w', value: '1/3', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'width', value: '33.333333%' }]);
    });

    it('resolves w:2/3 to width: 66.666667%', () => {
      const result = resolveToken({ property: 'w', value: '2/3', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'width', value: '66.666667%' }]);
    });

    it('resolves w:1/4 to width: 25%', () => {
      const result = resolveToken({ property: 'w', value: '1/4', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'width', value: '25%' }]);
    });

    it('resolves w:3/4 to width: 75%', () => {
      const result = resolveToken({ property: 'w', value: '3/4', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'width', value: '75%' }]);
    });

    it('resolves w:1/5 to width: 20%', () => {
      const result = resolveToken({ property: 'w', value: '1/5', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'width', value: '20%' }]);
    });

    it('resolves w:1/6 to width: 16.666667%', () => {
      const result = resolveToken({ property: 'w', value: '1/6', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'width', value: '16.666667%' }]);
    });

    it('resolves w:5/6 to width: 83.333333%', () => {
      const result = resolveToken({ property: 'w', value: '5/6', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'width', value: '83.333333%' }]);
    });

    it('resolves w:3/2 to width: 150% (fractions > 1 allowed)', () => {
      const result = resolveToken({ property: 'w', value: '3/2', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'width', value: '150%' }]);
    });

    it('resolves min-w:1/3 to min-width: 33.333333%', () => {
      const result = resolveToken({ property: 'min-w', value: '1/3', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'min-width', value: '33.333333%' }]);
    });

    it('resolves h:1/2 to height: 50%', () => {
      const result = resolveToken({ property: 'h', value: '1/2', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'height', value: '50%' }]);
    });

    it('resolves max-w:3/4 to max-width: 75%', () => {
      const result = resolveToken({ property: 'max-w', value: '3/4', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'max-width', value: '75%' }]);
    });

    it('throws on w:0/0 (division by zero)', () => {
      expect(() => resolveToken({ property: 'w', value: '0/0', pseudo: null })).toThrow(
        TokenResolveError,
      );
    });

    it('resolves w:1/1 to width: 100%', () => {
      const result = resolveToken({ property: 'w', value: '1/1', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'width', value: '100%' }]);
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

  describe('font-style keywords', () => {
    it('resolves italic to font-style: italic', () => {
      const result = resolveToken({ property: 'italic', value: null, pseudo: null });
      expect(result.declarations).toEqual([{ property: 'font-style', value: 'italic' }]);
    });

    it('resolves not-italic to font-style: normal', () => {
      const result = resolveToken({ property: 'not-italic', value: null, pseudo: null });
      expect(result.declarations).toEqual([{ property: 'font-style', value: 'normal' }]);
    });
  });

  describe('list-style', () => {
    it('resolves list:none to list-style: none', () => {
      const result = resolveToken({ property: 'list', value: 'none', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'list-style', value: 'none' }]);
    });

    it('resolves list:disc to list-style: disc', () => {
      const result = resolveToken({ property: 'list', value: 'disc', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'list-style', value: 'disc' }]);
    });

    it('resolves list:decimal to list-style: decimal', () => {
      const result = resolveToken({ property: 'list', value: 'decimal', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'list-style', value: 'decimal' }]);
    });

    it('resolves list:inside to list-style-position: inside', () => {
      const result = resolveToken({ property: 'list', value: 'inside', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'list-style-position', value: 'inside' }]);
    });

    it('resolves list:outside to list-style-position: outside', () => {
      const result = resolveToken({ property: 'list', value: 'outside', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'list-style-position', value: 'outside' }]);
    });

    it('throws on invalid list value', () => {
      expect(() => resolveToken({ property: 'list', value: 'potato', pseudo: null })).toThrow(
        TokenResolveError,
      );
    });
  });

  describe('overflow', () => {
    it('resolves overflow:auto to overflow: auto', () => {
      const result = resolveToken({ property: 'overflow', value: 'auto', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'overflow', value: 'auto' }]);
    });

    it('resolves overflow:scroll to overflow: scroll', () => {
      const result = resolveToken({ property: 'overflow', value: 'scroll', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'overflow', value: 'scroll' }]);
    });

    it('resolves overflow:visible to overflow: visible', () => {
      const result = resolveToken({ property: 'overflow', value: 'visible', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'overflow', value: 'visible' }]);
    });

    it('resolves overflow:hidden to overflow: hidden', () => {
      const result = resolveToken({ property: 'overflow', value: 'hidden', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'overflow', value: 'hidden' }]);
    });

    it('resolves overflow-x:auto to overflow-x: auto', () => {
      const result = resolveToken({ property: 'overflow-x', value: 'auto', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'overflow-x', value: 'auto' }]);
    });

    it('resolves overflow-x:scroll to overflow-x: scroll', () => {
      const result = resolveToken({ property: 'overflow-x', value: 'scroll', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'overflow-x', value: 'scroll' }]);
    });

    it('resolves overflow-y:auto to overflow-y: auto', () => {
      const result = resolveToken({ property: 'overflow-y', value: 'auto', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'overflow-y', value: 'auto' }]);
    });

    it('resolves overflow-y:hidden to overflow-y: hidden', () => {
      const result = resolveToken({ property: 'overflow-y', value: 'hidden', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'overflow-y', value: 'hidden' }]);
    });

    it('overflow-hidden keyword still works (no regression)', () => {
      const result = resolveToken({ property: 'overflow-hidden', value: null, pseudo: null });
      expect(result.declarations).toEqual([{ property: 'overflow', value: 'hidden' }]);
    });
  });

  describe('transform scale keywords', () => {
    it('resolves scale-0 to transform: scale(0)', () => {
      const result = resolveToken({ property: 'scale-0', value: null, pseudo: null });
      expect(result.declarations).toEqual([{ property: 'transform', value: 'scale(0)' }]);
    });

    it('resolves scale-75 to transform: scale(0.75)', () => {
      const result = resolveToken({ property: 'scale-75', value: null, pseudo: null });
      expect(result.declarations).toEqual([{ property: 'transform', value: 'scale(0.75)' }]);
    });

    it('resolves scale-90 to transform: scale(0.9)', () => {
      const result = resolveToken({ property: 'scale-90', value: null, pseudo: null });
      expect(result.declarations).toEqual([{ property: 'transform', value: 'scale(0.9)' }]);
    });

    it('resolves scale-95 to transform: scale(0.95)', () => {
      const result = resolveToken({ property: 'scale-95', value: null, pseudo: null });
      expect(result.declarations).toEqual([{ property: 'transform', value: 'scale(0.95)' }]);
    });

    it('resolves scale-100 to transform: scale(1)', () => {
      const result = resolveToken({ property: 'scale-100', value: null, pseudo: null });
      expect(result.declarations).toEqual([{ property: 'transform', value: 'scale(1)' }]);
    });

    it('resolves scale-105 to transform: scale(1.05)', () => {
      const result = resolveToken({ property: 'scale-105', value: null, pseudo: null });
      expect(result.declarations).toEqual([{ property: 'transform', value: 'scale(1.05)' }]);
    });

    it('resolves scale-110 to transform: scale(1.1)', () => {
      const result = resolveToken({ property: 'scale-110', value: null, pseudo: null });
      expect(result.declarations).toEqual([{ property: 'transform', value: 'scale(1.1)' }]);
    });

    it('resolves scale-125 to transform: scale(1.25)', () => {
      const result = resolveToken({ property: 'scale-125', value: null, pseudo: null });
      expect(result.declarations).toEqual([{ property: 'transform', value: 'scale(1.25)' }]);
    });

    it('resolves scale-150 to transform: scale(1.5)', () => {
      const result = resolveToken({ property: 'scale-150', value: null, pseudo: null });
      expect(result.declarations).toEqual([{ property: 'transform', value: 'scale(1.5)' }]);
    });

    it('resolves hover:scale-110 with pseudo', () => {
      const result = resolveToken({ property: 'scale-110', value: null, pseudo: ':hover' });
      expect(result.pseudo).toBe(':hover');
      expect(result.declarations).toEqual([{ property: 'transform', value: 'scale(1.1)' }]);
    });
  });

  describe('color opacity modifier', () => {
    it('resolves bg:primary/50 to color-mix', () => {
      const result = resolveToken({ property: 'bg', value: 'primary/50', pseudo: null });
      expect(result.declarations).toEqual([
        {
          property: 'background-color',
          value: 'color-mix(in oklch, var(--color-primary) 50%, transparent)',
        },
      ]);
    });

    it('resolves bg:primary.700/50 to color-mix with shade', () => {
      const result = resolveToken({ property: 'bg', value: 'primary.700/50', pseudo: null });
      expect(result.declarations).toEqual([
        {
          property: 'background-color',
          value: 'color-mix(in oklch, var(--color-primary-700) 50%, transparent)',
        },
      ]);
    });

    it('resolves bg:background/80', () => {
      const result = resolveToken({ property: 'bg', value: 'background/80', pseudo: null });
      expect(result.declarations).toEqual([
        {
          property: 'background-color',
          value: 'color-mix(in oklch, var(--color-background) 80%, transparent)',
        },
      ]);
    });

    it('resolves text:muted/90 via multi-mode resolver', () => {
      const result = resolveToken({ property: 'text', value: 'muted/90', pseudo: null });
      expect(result.declarations).toEqual([
        {
          property: 'color',
          value: 'color-mix(in oklch, var(--color-muted) 90%, transparent)',
        },
      ]);
    });

    it('resolves border:ring/30 via multi-mode resolver', () => {
      const result = resolveToken({ property: 'border', value: 'ring/30', pseudo: null });
      expect(result.declarations).toEqual([
        {
          property: 'border-color',
          value: 'color-mix(in oklch, var(--color-ring) 30%, transparent)',
        },
      ]);
    });

    it('resolves ring:primary.500/50 via multi-mode resolver', () => {
      const result = resolveToken({ property: 'ring', value: 'primary.500/50', pseudo: null });
      expect(result.declarations).toEqual([
        {
          property: 'outline-color',
          value: 'color-mix(in oklch, var(--color-primary-500) 50%, transparent)',
        },
      ]);
    });

    it('resolves bg:primary/0 (fully transparent)', () => {
      const result = resolveToken({ property: 'bg', value: 'primary/0', pseudo: null });
      expect(result.declarations).toEqual([
        {
          property: 'background-color',
          value: 'color-mix(in oklch, var(--color-primary) 0%, transparent)',
        },
      ]);
    });

    it('resolves bg:primary/100 (fully opaque)', () => {
      const result = resolveToken({ property: 'bg', value: 'primary/100', pseudo: null });
      expect(result.declarations).toEqual([
        {
          property: 'background-color',
          value: 'color-mix(in oklch, var(--color-primary) 100%, transparent)',
        },
      ]);
    });

    it('resolves hover:bg:primary/50 with pseudo', () => {
      const result = resolveToken({ property: 'bg', value: 'primary/50', pseudo: ':hover' });
      expect(result.pseudo).toBe(':hover');
      expect(result.declarations).toEqual([
        {
          property: 'background-color',
          value: 'color-mix(in oklch, var(--color-primary) 50%, transparent)',
        },
      ]);
    });

    it('throws on bg:potato/50 (invalid namespace)', () => {
      expect(() => resolveToken({ property: 'bg', value: 'potato/50', pseudo: null })).toThrow(
        TokenResolveError,
      );
    });

    it('throws on bg:primary/200 (out of range)', () => {
      expect(() => resolveToken({ property: 'bg', value: 'primary/200', pseudo: null })).toThrow(
        TokenResolveError,
      );
    });

    it('throws on bg:primary/-10 (negative)', () => {
      expect(() => resolveToken({ property: 'bg', value: 'primary/-10', pseudo: null })).toThrow(
        TokenResolveError,
      );
    });

    it('throws on bg:primary/50.5 (non-integer)', () => {
      expect(() => resolveToken({ property: 'bg', value: 'primary/50.5', pseudo: null })).toThrow(
        TokenResolveError,
      );
    });

    it('throws on bg:primary/abc (non-numeric)', () => {
      expect(() => resolveToken({ property: 'bg', value: 'primary/abc', pseudo: null })).toThrow(
        TokenResolveError,
      );
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

  describe('isValidColorToken', () => {
    it('returns true for plain color namespace', () => {
      expect(isValidColorToken('primary')).toBe(true);
    });

    it('returns true for dotted color token', () => {
      expect(isValidColorToken('primary.700')).toBe(true);
    });

    it('returns true for color with opacity modifier', () => {
      expect(isValidColorToken('primary/50')).toBe(true);
    });

    it('returns true for dotted color with opacity modifier', () => {
      expect(isValidColorToken('primary.700/50')).toBe(true);
    });

    it('returns false for unknown namespace', () => {
      expect(isValidColorToken('potato')).toBe(false);
    });

    it('returns false for unknown namespace with opacity', () => {
      expect(isValidColorToken('potato/50')).toBe(false);
    });
  });

  describe('position offsets (top, right, bottom, left)', () => {
    it('resolves top:0 to top: 0', () => {
      const result = resolveToken({ property: 'top', value: '0', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'top', value: '0' }]);
    });

    it('resolves top:4 to top: 1rem (spacing scale)', () => {
      const result = resolveToken({ property: 'top', value: '4', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'top', value: '1rem' }]);
    });

    it('resolves right:2 to right: 0.5rem', () => {
      const result = resolveToken({ property: 'right', value: '2', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'right', value: '0.5rem' }]);
    });

    it('resolves bottom:auto to bottom: auto', () => {
      const result = resolveToken({ property: 'bottom', value: 'auto', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'bottom', value: 'auto' }]);
    });

    it('resolves left:8 to left: 2rem', () => {
      const result = resolveToken({ property: 'left', value: '8', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'left', value: '2rem' }]);
    });

    it('passes through raw CSS values for top', () => {
      const result = resolveToken({ property: 'top', value: '50%', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'top', value: '50%' }]);
    });

    it('supports pseudo prefix on position offsets', () => {
      const result = resolveToken({ property: 'top', value: '0', pseudo: 'hover' });
      expect(result.declarations).toEqual([{ property: 'top', value: '0' }]);
      expect(result.pseudo).toBe('hover');
    });
  });

  describe('object-fit', () => {
    it('resolves object:cover to object-fit: cover', () => {
      const result = resolveToken({ property: 'object', value: 'cover', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'object-fit', value: 'cover' }]);
    });

    it('resolves object:contain to object-fit: contain', () => {
      const result = resolveToken({ property: 'object', value: 'contain', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'object-fit', value: 'contain' }]);
    });

    it('resolves object:fill to object-fit: fill', () => {
      const result = resolveToken({ property: 'object', value: 'fill', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'object-fit', value: 'fill' }]);
    });

    it('resolves object:none to object-fit: none', () => {
      const result = resolveToken({ property: 'object', value: 'none', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'object-fit', value: 'none' }]);
    });

    it('resolves object:scale-down to object-fit: scale-down', () => {
      const result = resolveToken({ property: 'object', value: 'scale-down', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'object-fit', value: 'scale-down' }]);
    });
  });

  describe('aspect-ratio', () => {
    it('resolves aspect:auto to aspect-ratio: auto', () => {
      const result = resolveToken({ property: 'aspect', value: 'auto', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'aspect-ratio', value: 'auto' }]);
    });

    it('resolves aspect:square to aspect-ratio: 1 / 1', () => {
      const result = resolveToken({ property: 'aspect', value: 'square', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'aspect-ratio', value: '1 / 1' }]);
    });

    it('resolves aspect:video to aspect-ratio: 16 / 9', () => {
      const result = resolveToken({ property: 'aspect', value: 'video', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'aspect-ratio', value: '16 / 9' }]);
    });

    it('resolves aspect:photo to aspect-ratio: 4 / 3', () => {
      const result = resolveToken({ property: 'aspect', value: 'photo', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'aspect-ratio', value: '4 / 3' }]);
    });

    it('passes through raw ratio values', () => {
      const result = resolveToken({ property: 'aspect', value: '21/9', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'aspect-ratio', value: '21/9' }]);
    });
  });

  describe('whitespace property', () => {
    it('resolves whitespace:pre to white-space: pre', () => {
      const result = resolveToken({ property: 'whitespace', value: 'pre', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'white-space', value: 'pre' }]);
    });

    it('resolves whitespace:pre-wrap to white-space: pre-wrap', () => {
      const result = resolveToken({ property: 'whitespace', value: 'pre-wrap', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'white-space', value: 'pre-wrap' }]);
    });

    it('resolves whitespace:pre-line to white-space: pre-line', () => {
      const result = resolveToken({ property: 'whitespace', value: 'pre-line', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'white-space', value: 'pre-line' }]);
    });

    it('resolves whitespace:normal to white-space: normal', () => {
      const result = resolveToken({ property: 'whitespace', value: 'normal', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'white-space', value: 'normal' }]);
    });
  });

  describe('text-overflow property', () => {
    it('resolves text-overflow:ellipsis to text-overflow: ellipsis', () => {
      const result = resolveToken({ property: 'text-overflow', value: 'ellipsis', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'text-overflow', value: 'ellipsis' }]);
    });

    it('resolves text-overflow:clip to text-overflow: clip', () => {
      const result = resolveToken({ property: 'text-overflow', value: 'clip', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'text-overflow', value: 'clip' }]);
    });
  });

  describe('overflow-wrap property', () => {
    it('resolves overflow-wrap:break-word to overflow-wrap: break-word', () => {
      const result = resolveToken({
        property: 'overflow-wrap',
        value: 'break-word',
        pseudo: null,
      });
      expect(result.declarations).toEqual([{ property: 'overflow-wrap', value: 'break-word' }]);
    });

    it('resolves overflow-wrap:anywhere to overflow-wrap: anywhere', () => {
      const result = resolveToken({ property: 'overflow-wrap', value: 'anywhere', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'overflow-wrap', value: 'anywhere' }]);
    });

    it('resolves overflow-wrap:normal to overflow-wrap: normal', () => {
      const result = resolveToken({ property: 'overflow-wrap', value: 'normal', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'overflow-wrap', value: 'normal' }]);
    });
  });

  describe('truncate keyword', () => {
    it('resolves truncate to overflow + white-space + text-overflow', () => {
      const result = resolveToken({ property: 'truncate', value: null, pseudo: null });
      expect(result.declarations).toEqual([
        { property: 'overflow', value: 'hidden' },
        { property: 'white-space', value: 'nowrap' },
        { property: 'text-overflow', value: 'ellipsis' },
      ]);
    });

    it('resolves truncate with pseudo prefix', () => {
      const result = resolveToken({ property: 'truncate', value: null, pseudo: ':hover' });
      expect(result.declarations).toEqual([
        { property: 'overflow', value: 'hidden' },
        { property: 'white-space', value: 'nowrap' },
        { property: 'text-overflow', value: 'ellipsis' },
      ]);
      expect(result.pseudo).toBe(':hover');
    });
  });

  describe('whitespace keywords', () => {
    it('resolves whitespace-pre keyword to white-space: pre', () => {
      const result = resolveToken({ property: 'whitespace-pre', value: null, pseudo: null });
      expect(result.declarations).toEqual([{ property: 'white-space', value: 'pre' }]);
    });

    it('resolves whitespace-pre-wrap keyword to white-space: pre-wrap', () => {
      const result = resolveToken({ property: 'whitespace-pre-wrap', value: null, pseudo: null });
      expect(result.declarations).toEqual([{ property: 'white-space', value: 'pre-wrap' }]);
    });
  });

  describe('font:family (mono, sans, serif)', () => {
    it('resolves font:mono to font-family with monospace stack', () => {
      const result = resolveToken({ property: 'font', value: 'mono', pseudo: null });
      expect(result.declarations).toEqual([
        {
          property: 'font-family',
          value:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        },
      ]);
    });

    it('resolves font:sans to font-family with sans-serif stack', () => {
      const result = resolveToken({ property: 'font', value: 'sans', pseudo: null });
      expect(result.declarations).toEqual([
        {
          property: 'font-family',
          value:
            'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
        },
      ]);
    });

    it('resolves font:serif to font-family with serif stack', () => {
      const result = resolveToken({ property: 'font', value: 'serif', pseudo: null });
      expect(result.declarations).toEqual([
        {
          property: 'font-family',
          value: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
        },
      ]);
    });

    it('font:bold still resolves to font-weight (no regression)', () => {
      const result = resolveToken({ property: 'font', value: 'bold', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'font-weight', value: '700' }]);
    });

    it('font:lg still resolves to font-size (no regression)', () => {
      const result = resolveToken({ property: 'font', value: 'lg', pseudo: null });
      expect(result.declarations).toEqual([{ property: 'font-size', value: '1.125rem' }]);
    });
  });

  describe('raw palette colors', () => {
    it('resolves bg:green.100 to direct oklch value', () => {
      const result = resolveToken({ property: 'bg', value: 'green.100', pseudo: null });
      expect(result.declarations).toEqual([
        { property: 'background-color', value: 'oklch(0.962 0.044 156.743)' },
      ]);
    });

    it('resolves text:red.700 to direct oklch value', () => {
      const result = resolveToken({ property: 'text', value: 'red.700', pseudo: null });
      expect(result.declarations[0].property).toBe('color');
      expect(result.declarations[0].value).toMatch(/^oklch\(/);
    });

    it('resolves border:blue.300 to direct oklch value', () => {
      const result = resolveToken({ property: 'border', value: 'blue.300', pseudo: null });
      expect(result.declarations[0].property).toBe('border-color');
      expect(result.declarations[0].value).toMatch(/^oklch\(/);
    });

    it('resolves palette color with opacity modifier', () => {
      const result = resolveToken({ property: 'bg', value: 'green.100/50', pseudo: null });
      expect(result.declarations[0].value).toMatch(/^color-mix\(in oklch,/);
      expect(result.declarations[0].value).toContain('oklch(0.962 0.044 156.743)');
      expect(result.declarations[0].value).toContain('50%');
    });

    it('gray resolves to CSS var (semantic precedence)', () => {
      const result = resolveToken({ property: 'bg', value: 'gray.500', pseudo: null });
      expect(result.declarations).toEqual([
        { property: 'background-color', value: 'var(--color-gray-500)' },
      ]);
    });

    it('throws on invalid palette shade', () => {
      expect(() => resolveToken({ property: 'bg', value: 'green.42', pseudo: null })).toThrow(
        TokenResolveError,
      );
    });

    it('throws on unknown palette name', () => {
      expect(() => resolveToken({ property: 'bg', value: 'chartreuse.100', pseudo: null })).toThrow(
        TokenResolveError,
      );
    });

    it('supports all 21 non-gray palette names', () => {
      const names = [
        'slate',
        'zinc',
        'neutral',
        'stone',
        'red',
        'orange',
        'amber',
        'yellow',
        'lime',
        'green',
        'emerald',
        'teal',
        'cyan',
        'sky',
        'blue',
        'indigo',
        'violet',
        'purple',
        'fuchsia',
        'pink',
        'rose',
      ];
      for (const name of names) {
        const result = resolveToken({ property: 'bg', value: `${name}.500`, pseudo: null });
        expect(result.declarations[0].value).toMatch(/^oklch\(/);
      }
    });

    it('isValidColorToken returns true for palette colors', () => {
      expect(isValidColorToken('green.500')).toBe(true);
    });

    it('isValidColorToken returns false for invalid palette shade', () => {
      expect(isValidColorToken('green.42')).toBe(false);
    });

    it('isValidColorToken returns false for unknown palette name', () => {
      expect(isValidColorToken('chartreuse.100')).toBe(false);
    });
  });
});
