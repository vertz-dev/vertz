/**
 * Tests for token-tables.ts — the single source of truth for CSS token resolution.
 *
 * These tests verify:
 * 1. All tables are non-empty (smoke test)
 * 2. Key tokens are present (regression guard for drift)
 * 3. DISPLAY_MAP is consistent with KEYWORD_MAP display entries
 * 4. svw/dvw are present in SIZE_KEYWORDS (previously drifted)
 * 5. All critical color namespaces are present
 * 6. All CSS color keywords are present
 */

import { describe, expect, it } from 'vitest';
import {
  ALIGNMENT_MAP,
  COLOR_NAMESPACES,
  CONTENT_MAP,
  CSS_COLOR_KEYWORDS,
  DISPLAY_MAP,
  FONT_SIZE_SCALE,
  FONT_WEIGHT_SCALE,
  HEIGHT_AXIS_PROPERTIES,
  KEYWORD_MAP,
  LINE_HEIGHT_SCALE,
  PROPERTY_MAP,
  PSEUDO_MAP,
  PSEUDO_PREFIXES,
  RADIUS_SCALE,
  SHADOW_SCALE,
  SIZE_KEYWORDS,
  SPACING_SCALE,
} from '../token-tables';

describe('token-tables', () => {
  describe('all tables are non-empty', () => {
    it('PROPERTY_MAP has entries', () => {
      expect(Object.keys(PROPERTY_MAP).length).toBeGreaterThan(0);
    });

    it('KEYWORD_MAP has entries', () => {
      expect(Object.keys(KEYWORD_MAP).length).toBeGreaterThan(0);
    });

    it('SPACING_SCALE has entries', () => {
      expect(Object.keys(SPACING_SCALE).length).toBeGreaterThan(0);
    });

    it('RADIUS_SCALE has entries', () => {
      expect(Object.keys(RADIUS_SCALE).length).toBeGreaterThan(0);
    });

    it('SHADOW_SCALE has entries', () => {
      expect(Object.keys(SHADOW_SCALE).length).toBeGreaterThan(0);
    });

    it('FONT_SIZE_SCALE has entries', () => {
      expect(Object.keys(FONT_SIZE_SCALE).length).toBeGreaterThan(0);
    });

    it('FONT_WEIGHT_SCALE has entries', () => {
      expect(Object.keys(FONT_WEIGHT_SCALE).length).toBeGreaterThan(0);
    });

    it('LINE_HEIGHT_SCALE has entries', () => {
      expect(Object.keys(LINE_HEIGHT_SCALE).length).toBeGreaterThan(0);
    });

    it('ALIGNMENT_MAP has entries', () => {
      expect(Object.keys(ALIGNMENT_MAP).length).toBeGreaterThan(0);
    });

    it('SIZE_KEYWORDS has entries', () => {
      expect(Object.keys(SIZE_KEYWORDS).length).toBeGreaterThan(0);
    });

    it('COLOR_NAMESPACES has entries', () => {
      expect(COLOR_NAMESPACES.size).toBeGreaterThan(0);
    });

    it('CSS_COLOR_KEYWORDS has entries', () => {
      expect(CSS_COLOR_KEYWORDS.size).toBeGreaterThan(0);
    });

    it('PSEUDO_PREFIXES has entries', () => {
      expect(PSEUDO_PREFIXES.size).toBeGreaterThan(0);
    });

    it('PSEUDO_MAP has entries', () => {
      expect(Object.keys(PSEUDO_MAP).length).toBeGreaterThan(0);
    });

    it('CONTENT_MAP has entries', () => {
      expect(Object.keys(CONTENT_MAP).length).toBeGreaterThan(0);
    });

    it('DISPLAY_MAP has entries', () => {
      expect(Object.keys(DISPLAY_MAP).length).toBeGreaterThan(0);
    });
  });

  describe('svw/dvw viewport units are present (regression for prior drift)', () => {
    it('SIZE_KEYWORDS contains svw', () => {
      expect(SIZE_KEYWORDS.svw).toBe('100svw');
    });

    it('SIZE_KEYWORDS contains dvw', () => {
      expect(SIZE_KEYWORDS.dvw).toBe('100dvw');
    });
  });

  describe('critical color namespaces are present', () => {
    const required = [
      'primary',
      'secondary',
      'accent',
      'background',
      'foreground',
      'muted',
      'surface',
      'destructive',
      'danger',
      'success',
      'warning',
      'info',
      'border',
      'ring',
      'input',
      'card',
      'popover',
      'gray',
    ];

    for (const ns of required) {
      it(`COLOR_NAMESPACES contains '${ns}'`, () => {
        expect(COLOR_NAMESPACES.has(ns)).toBe(true);
      });
    }
  });

  describe('CSS color keywords include white and black', () => {
    it('CSS_COLOR_KEYWORDS contains white', () => {
      expect(CSS_COLOR_KEYWORDS.has('white')).toBe(true);
    });

    it('CSS_COLOR_KEYWORDS contains black', () => {
      expect(CSS_COLOR_KEYWORDS.has('black')).toBe(true);
    });

    it('CSS_COLOR_KEYWORDS contains transparent', () => {
      expect(CSS_COLOR_KEYWORDS.has('transparent')).toBe(true);
    });

    it('CSS_COLOR_KEYWORDS contains currentColor', () => {
      expect(CSS_COLOR_KEYWORDS.has('currentColor')).toBe(true);
    });
  });

  describe('DISPLAY_MAP is consistent with KEYWORD_MAP display entries', () => {
    it('every DISPLAY_MAP entry has a corresponding KEYWORD_MAP entry', () => {
      for (const [keyword, displayValue] of Object.entries(DISPLAY_MAP)) {
        const keywordEntry = KEYWORD_MAP[keyword];
        expect(keywordEntry).toBeDefined();
        expect(keywordEntry).toEqual(
          expect.arrayContaining([{ property: 'display', value: displayValue }]),
        );
      }
    });
  });

  describe('PSEUDO_PREFIXES and PSEUDO_MAP are consistent', () => {
    it('every PSEUDO_PREFIX has a PSEUDO_MAP entry', () => {
      for (const prefix of PSEUDO_PREFIXES) {
        expect(PSEUDO_MAP[prefix]).toBeDefined();
      }
    });

    it('every PSEUDO_MAP key is in PSEUDO_PREFIXES', () => {
      for (const key of Object.keys(PSEUDO_MAP)) {
        expect(PSEUDO_PREFIXES.has(key)).toBe(true);
      }
    });
  });

  describe('HEIGHT_AXIS_PROPERTIES contains expected properties', () => {
    it('contains h', () => {
      expect(HEIGHT_AXIS_PROPERTIES.has('h')).toBe(true);
    });

    it('contains min-h', () => {
      expect(HEIGHT_AXIS_PROPERTIES.has('min-h')).toBe(true);
    });

    it('contains max-h', () => {
      expect(HEIGHT_AXIS_PROPERTIES.has('max-h')).toBe(true);
    });

    it('does not contain w', () => {
      expect(HEIGHT_AXIS_PROPERTIES.has('w')).toBe(false);
    });
  });

  describe('SIZE_KEYWORDS includes named breakpoints', () => {
    const breakpoints = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl'];

    for (const bp of breakpoints) {
      it(`SIZE_KEYWORDS contains breakpoint '${bp}'`, () => {
        expect(SIZE_KEYWORDS[bp]).toBeDefined();
      });
    }
  });

  describe('PROPERTY_MAP has all essential property shorthands', () => {
    const essential = [
      'p',
      'px',
      'py',
      'pt',
      'pr',
      'pb',
      'pl',
      'm',
      'mx',
      'my',
      'mt',
      'mr',
      'mb',
      'ml',
      'w',
      'h',
      'min-w',
      'max-w',
      'min-h',
      'max-h',
      'bg',
      'text',
      'border',
      'border-r',
      'border-l',
      'border-t',
      'border-b',
      'rounded',
      'shadow',
      'gap',
      'items',
      'justify',
      'grid-cols',
      'font',
      'weight',
      'leading',
      'tracking',
      'ring',
      'content',
      'cursor',
      'transition',
      'resize',
      'opacity',
      'inset',
      'z',
    ];

    for (const prop of essential) {
      it(`PROPERTY_MAP contains '${prop}'`, () => {
        expect(PROPERTY_MAP[prop]).toBeDefined();
      });
    }
  });

  describe('KEYWORD_MAP has all essential keywords', () => {
    const essential = [
      'flex',
      'grid',
      'block',
      'inline',
      'hidden',
      'inline-flex',
      'flex-1',
      'flex-col',
      'flex-row',
      'flex-wrap',
      'flex-nowrap',
      'fixed',
      'absolute',
      'relative',
      'sticky',
      'uppercase',
      'lowercase',
      'capitalize',
      'outline-none',
    ];

    for (const kw of essential) {
      it(`KEYWORD_MAP contains '${kw}'`, () => {
        expect(KEYWORD_MAP[kw]).toBeDefined();
      });
    }
  });
});
