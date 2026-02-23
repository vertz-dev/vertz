import { describe, expect, it } from 'vitest';
import { parseKey } from '../input/key-parser';
import { TestStdin } from '../test/test-stdin';

describe('parseKey', () => {
  it('parses regular character', () => {
    const key = parseKey(Buffer.from('a'));
    expect(key.name).toBe('a');
    expect(key.char).toBe('a');
    expect(key.ctrl).toBe(false);
  });

  it('parses Ctrl+C', () => {
    const key = parseKey(Buffer.from([3]));
    expect(key.name).toBe('c');
    expect(key.ctrl).toBe(true);
  });

  it('parses Enter/Return', () => {
    const key = parseKey(Buffer.from('\r'));
    expect(key.name).toBe('return');
  });

  it('parses Tab', () => {
    const key = parseKey(Buffer.from('\t'));
    expect(key.name).toBe('tab');
  });

  it('parses Backspace', () => {
    const key = parseKey(Buffer.from([0x7f]));
    expect(key.name).toBe('backspace');
  });

  it('parses Space', () => {
    const key = parseKey(Buffer.from(' '));
    expect(key.name).toBe('space');
    expect(key.char).toBe(' ');
  });

  it('parses Escape', () => {
    const key = parseKey(Buffer.from('\x1b'));
    expect(key.name).toBe('escape');
  });

  it('parses Up arrow', () => {
    const key = parseKey(Buffer.from('\x1b[A'));
    expect(key.name).toBe('up');
  });

  it('parses Down arrow', () => {
    const key = parseKey(Buffer.from('\x1b[B'));
    expect(key.name).toBe('down');
  });

  it('parses Shift+Tab', () => {
    const key = parseKey(Buffer.from('\x1b[Z'));
    expect(key.name).toBe('tab');
    expect(key.shift).toBe(true);
  });

  it('parses Delete', () => {
    const key = parseKey(Buffer.from('\x1b[3~'));
    expect(key.name).toBe('delete');
  });
});

describe('TestStdin', () => {
  it('fires key events to listeners', () => {
    const stdin = new TestStdin();
    const events: string[] = [];

    stdin.onKey((key) => events.push(key.name));
    stdin.pressKey('a');
    stdin.pressKey('b');

    expect(events).toEqual(['a', 'b']);
  });

  it('supports cleanup', () => {
    const stdin = new TestStdin();
    const events: string[] = [];

    const cleanup = stdin.onKey((key) => events.push(key.name));
    stdin.pressKey('a');
    cleanup();
    stdin.pressKey('b');

    expect(events).toEqual(['a']);
  });

  it('types a string character by character', () => {
    const stdin = new TestStdin();
    const chars: string[] = [];

    stdin.onKey((key) => chars.push(key.char));
    stdin.type('hi');

    expect(chars).toEqual(['h', 'i']);
  });
});
