import { describe, expect, test } from '@vertz/test';
import { serializeQueryKey } from '../key-serialization';

describe('serializeQueryKey', () => {
  describe('Given a string key', () => {
    describe('When serialized', () => {
      test('then it passes through unchanged', () => {
        expect(serializeQueryKey('foo')).toBe('foo');
        expect(serializeQueryKey('')).toBe('');
        expect(serializeQueryKey('with:colons:and|pipes')).toBe('with:colons:and|pipes');
      });
    });
  });

  describe('Given a tuple key with primitive values', () => {
    describe('When serialized', () => {
      test('then it produces a stable JSON string', () => {
        expect(serializeQueryKey(['session', 'abc'])).toBe('["session","abc"]');
        expect(serializeQueryKey(['count', 42, true, null])).toBe('["count",42,true,null]');
      });
    });
  });

  describe('Given two tuple keys containing the same object with reordered keys', () => {
    describe('When serialized', () => {
      test('then both produce the same string', () => {
        const a = serializeQueryKey([{ b: 2, a: 1 }]);
        const b = serializeQueryKey([{ a: 1, b: 2 }]);
        expect(a).toBe(b);
      });
    });
  });

  describe('Given a deeply nested tuple with reversed key order at every level', () => {
    describe('When serialized', () => {
      test('then both produce the same string', () => {
        const left = serializeQueryKey([{ z: { y: { x: 1, w: 2 }, v: [3, 4] }, a: 'q' }]);
        const right = serializeQueryKey([{ a: 'q', z: { v: [3, 4], y: { w: 2, x: 1 } } }]);
        expect(left).toBe(right);
      });
    });
  });

  describe('Given a tuple containing a function', () => {
    describe('When serialized', () => {
      test('then it throws naming the offending position', () => {
        expect(() => serializeQueryKey(['ok', () => {}, 'tail'])).toThrowError(/index 1/);
      });
    });
  });

  describe('Given a tuple containing a symbol', () => {
    describe('When serialized', () => {
      test('then it throws naming the offending position', () => {
        expect(() => serializeQueryKey([Symbol('x')])).toThrowError(/index 0/);
      });
    });
  });

  describe('Given a tuple containing a class instance', () => {
    describe('When serialized', () => {
      test('then it throws naming the offending position', () => {
        class Box {
          value = 1;
        }
        expect(() => serializeQueryKey([new Box()])).toThrowError(/index 0/);
      });
    });
  });

  describe('Given a tuple containing a nested function', () => {
    describe('When serialized', () => {
      test('then it throws naming the offending nested path', () => {
        expect(() => serializeQueryKey([{ outer: { inner: () => {} } }])).toThrowError(
          /index 0.*outer.*inner/,
        );
      });
    });
  });

  describe('Given a tuple containing arrays of plain values', () => {
    describe('When serialized', () => {
      test('then arrays preserve order (no sort)', () => {
        expect(serializeQueryKey([[3, 1, 2]])).toBe('[[3,1,2]]');
        expect(serializeQueryKey([[3, 1, 2]])).not.toBe(serializeQueryKey([[1, 2, 3]]));
      });
    });
  });
});
