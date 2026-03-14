import { describe, expect, it, afterAll } from 'bun:test';
import { loadFreetype } from '../text/freetype-ffi';

const FONT_PATH = '/System/Library/Fonts/Supplemental/Arial.ttf';

describe('FreetypeBindings', () => {
  const ft = loadFreetype();
  let face: number;

  afterAll(() => {
    if (face) ft.freeFont(face);
    ft.shutdown();
  });

  describe('Given FreeType is initialized', () => {
    it('Then init returns 0 (success)', () => {
      expect(ft.init()).toBe(0);
    });
  });

  describe('Given a font file path', () => {
    it('Then loadFont returns a non-null face handle', () => {
      face = ft.loadFont(FONT_PATH, 24);
      expect(face).not.toBe(0);
    });
  });

  describe('Given a loaded font face', () => {
    it('Then lineHeight returns a positive value', () => {
      const lh = ft.lineHeight(face);
      expect(lh).toBeGreaterThan(0);
    });

    it('Then ascender returns a positive value', () => {
      const asc = ft.ascender(face);
      expect(asc).toBeGreaterThan(0);
    });
  });

  describe('Given a character code', () => {
    it('Then renderGlyph returns metrics and a bitmap buffer', () => {
      const glyph = ft.renderGlyph(face, 'A'.charCodeAt(0));
      expect(glyph).not.toBeNull();
      expect(glyph!.width).toBeGreaterThan(0);
      expect(glyph!.height).toBeGreaterThan(0);
      expect(glyph!.advance).toBeGreaterThan(0);
      expect(glyph!.buffer).not.toBe(0);
    });

    it('Then different characters have different widths', () => {
      const glyphM = ft.renderGlyph(face, 'M'.charCodeAt(0));
      const glyphI = ft.renderGlyph(face, 'i'.charCodeAt(0));
      expect(glyphM).not.toBeNull();
      expect(glyphI).not.toBeNull();
      expect(glyphM!.width).toBeGreaterThan(glyphI!.width);
    });
  });

  describe('Given a text string', () => {
    it('Then measureText returns the total advance width', () => {
      const width = ft.measureText(face, 'Hello');
      expect(width).toBeGreaterThan(0);
    });

    it('Then longer text is wider', () => {
      const shortWidth = ft.measureText(face, 'Hi');
      const longWidth = ft.measureText(face, 'Hello World');
      expect(longWidth).toBeGreaterThan(shortWidth);
    });

    it('Then empty text has zero width', () => {
      const width = ft.measureText(face, '');
      expect(width).toBe(0);
    });
  });
});
