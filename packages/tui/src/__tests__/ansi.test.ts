import { describe, expect, it } from 'vitest';
import { cursorTo, RESET, renderRegions, styleToSGR } from '../renderer/ansi';

describe('ANSI', () => {
  describe('styleToSGR', () => {
    it('returns empty string for no style', () => {
      expect(styleToSGR({})).toBe('');
    });

    it('renders bold', () => {
      expect(styleToSGR({ bold: true })).toBe('\x1b[1m');
    });

    it('renders dim', () => {
      expect(styleToSGR({ dim: true })).toBe('\x1b[2m');
    });

    it('renders italic', () => {
      expect(styleToSGR({ italic: true })).toBe('\x1b[3m');
    });

    it('renders underline', () => {
      expect(styleToSGR({ underline: true })).toBe('\x1b[4m');
    });

    it('renders strikethrough', () => {
      expect(styleToSGR({ strikethrough: true })).toBe('\x1b[9m');
    });

    it('renders named foreground color', () => {
      expect(styleToSGR({ color: 'red' })).toBe('\x1b[31m');
      expect(styleToSGR({ color: 'cyan' })).toBe('\x1b[36m');
    });

    it('renders named background color', () => {
      expect(styleToSGR({ bgColor: 'blue' })).toBe('\x1b[44m');
    });

    it('renders bright colors', () => {
      expect(styleToSGR({ color: 'redBright' })).toBe('\x1b[91m');
      expect(styleToSGR({ color: 'cyanBright' })).toBe('\x1b[96m');
    });

    it('renders hex foreground color', () => {
      expect(styleToSGR({ color: '#ff0000' })).toBe('\x1b[38;2;255;0;0m');
    });

    it('renders hex background color', () => {
      expect(styleToSGR({ bgColor: '#00ff00' })).toBe('\x1b[48;2;0;255;0m');
    });

    it('combines multiple attributes', () => {
      const sgr = styleToSGR({ bold: true, color: 'red', underline: true });
      expect(sgr).toBe('\x1b[1;4;31m');
    });
  });

  describe('cursorTo', () => {
    it('generates cursor position escape code (1-indexed)', () => {
      expect(cursorTo(0, 0)).toBe('\x1b[1;1H');
      expect(cursorTo(5, 10)).toBe('\x1b[6;11H');
    });
  });

  describe('renderRegions', () => {
    it('returns empty string for no regions', () => {
      expect(renderRegions([])).toBe('');
    });

    it('renders a single region with unstyled cells', () => {
      const result = renderRegions([
        {
          row: 0,
          col: 0,
          cells: [
            { char: 'H', width: 1, style: {} },
            { char: 'i', width: 1, style: {} },
          ],
        },
      ]);
      expect(result).toBe('\x1b[1;1HHi');
    });

    it('renders styled cells with SGR codes and reset', () => {
      const result = renderRegions([
        {
          row: 1,
          col: 3,
          cells: [{ char: 'X', width: 1, style: { bold: true, color: 'red' } }],
        },
      ]);
      expect(result).toBe(`\x1b[2;4H\x1b[1;31mX${RESET}`);
    });

    it('renders multiple regions', () => {
      const result = renderRegions([
        { row: 0, col: 0, cells: [{ char: 'A', width: 1, style: {} }] },
        { row: 2, col: 5, cells: [{ char: 'B', width: 1, style: {} }] },
      ]);
      expect(result).toContain('\x1b[1;1HA');
      expect(result).toContain('\x1b[3;6HB');
    });
  });
});
