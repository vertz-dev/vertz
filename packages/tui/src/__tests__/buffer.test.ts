import { describe, expect, it } from 'vitest';
import { cellsEqual, emptyCell, stylesEqual } from '../buffer/cell';
import { TerminalBuffer } from '../buffer/terminal-buffer';

describe('Cell', () => {
  it('creates an empty cell with space character', () => {
    const cell = emptyCell();
    expect(cell.char).toBe(' ');
    expect(cell.width).toBe(1);
    expect(cell.style).toEqual({});
  });

  it('compares equal styles', () => {
    expect(stylesEqual({ bold: true, color: 'red' }, { bold: true, color: 'red' })).toBe(true);
  });

  it('detects different styles', () => {
    expect(stylesEqual({ bold: true }, { bold: false })).toBe(false);
    expect(stylesEqual({ color: 'red' }, { color: 'blue' })).toBe(false);
  });

  it('compares equal cells', () => {
    const a = { char: 'A', width: 1, style: { bold: true } };
    const b = { char: 'A', width: 1, style: { bold: true } };
    expect(cellsEqual(a, b)).toBe(true);
  });

  it('detects different cells', () => {
    const a = { char: 'A', width: 1, style: {} };
    const b = { char: 'B', width: 1, style: {} };
    expect(cellsEqual(a, b)).toBe(false);
  });
});

describe('TerminalBuffer', () => {
  it('creates a buffer with the given dimensions', () => {
    const buf = new TerminalBuffer(40, 10);
    expect(buf.width).toBe(40);
    expect(buf.height).toBe(10);
  });

  it('initializes all cells as empty spaces', () => {
    const buf = new TerminalBuffer(5, 3);
    expect(buf.getText()).toBe('     \n     \n     ');
  });

  it('sets a cell at a given position', () => {
    const buf = new TerminalBuffer(10, 3);
    buf.set(0, 0, 'H', {});
    buf.set(0, 1, 'i', {});
    expect(buf.getRowText(0)).toBe('Hi        ');
  });

  it('ignores out-of-bounds set calls', () => {
    const buf = new TerminalBuffer(5, 3);
    buf.set(-1, 0, 'X', {});
    buf.set(0, -1, 'X', {});
    buf.set(3, 0, 'X', {});
    buf.set(0, 5, 'X', {});
    expect(buf.getText()).toBe('     \n     \n     ');
  });

  it('writes a string at a position', () => {
    const buf = new TerminalBuffer(20, 3);
    buf.writeString(0, 0, 'Hello', {});
    expect(buf.getRowText(0)).toBe('Hello               ');
  });

  it('truncates strings that exceed width', () => {
    const buf = new TerminalBuffer(5, 1);
    buf.writeString(0, 3, 'Hello', {});
    expect(buf.getRowText(0)).toBe('   He');
  });

  it('preserves style when setting cells', () => {
    const buf = new TerminalBuffer(10, 1);
    buf.set(0, 0, 'X', { bold: true, color: 'red' });
    const cell = buf.get(0, 0);
    expect(cell?.style.bold).toBe(true);
    expect(cell?.style.color).toBe('red');
  });

  it('clears the buffer', () => {
    const buf = new TerminalBuffer(10, 3);
    buf.writeString(0, 0, 'Hello', {});
    buf.clear();
    expect(buf.getRowText(0)).toBe('          ');
  });

  it('clones the buffer', () => {
    const buf = new TerminalBuffer(10, 3);
    buf.writeString(0, 0, 'Hello', { bold: true });
    const clone = buf.clone();
    expect(clone.getRowText(0)).toBe(buf.getRowText(0));
    expect(clone.get(0, 0)?.style.bold).toBe(true);
    // Mutation of original should not affect clone
    buf.set(0, 0, 'X', {});
    expect(clone.get(0, 0)?.char).toBe('H');
  });

  describe('diff', () => {
    it('returns no regions for identical buffers', () => {
      const a = new TerminalBuffer(10, 3);
      const b = new TerminalBuffer(10, 3);
      a.writeString(0, 0, 'Hello', {});
      b.writeString(0, 0, 'Hello', {});
      expect(a.diff(b)).toEqual([]);
    });

    it('detects a single changed cell', () => {
      const current = new TerminalBuffer(10, 3);
      const previous = new TerminalBuffer(10, 3);
      current.set(1, 5, 'X', {});
      const regions = current.diff(previous);
      expect(regions).toHaveLength(1);
      expect(regions[0]?.row).toBe(1);
      expect(regions[0]?.col).toBe(5);
      expect(regions[0]?.cells).toHaveLength(1);
      expect(regions[0]?.cells[0]?.char).toBe('X');
    });

    it('groups contiguous changed cells into one region', () => {
      const current = new TerminalBuffer(10, 3);
      const previous = new TerminalBuffer(10, 3);
      current.writeString(0, 2, 'ABC', {});
      const regions = current.diff(previous);
      expect(regions).toHaveLength(1);
      expect(regions[0]?.col).toBe(2);
      expect(regions[0]?.cells).toHaveLength(3);
    });

    it('creates separate regions for non-contiguous changes', () => {
      const current = new TerminalBuffer(10, 3);
      const previous = new TerminalBuffer(10, 3);
      current.set(0, 0, 'A', {});
      current.set(0, 5, 'B', {});
      const regions = current.diff(previous);
      expect(regions).toHaveLength(2);
      expect(regions[0]?.col).toBe(0);
      expect(regions[1]?.col).toBe(5);
    });

    it('detects style changes', () => {
      const current = new TerminalBuffer(10, 3);
      const previous = new TerminalBuffer(10, 3);
      current.set(0, 0, 'A', { bold: true });
      previous.set(0, 0, 'A', {});
      const regions = current.diff(previous);
      expect(regions).toHaveLength(1);
    });
  });
});
