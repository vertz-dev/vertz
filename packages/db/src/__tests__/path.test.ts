import { describe, expect, it } from '@vertz/test';
import { path } from '../path';

describe('path() — Proxy-based selector', () => {
  describe('segment recording', () => {
    it('records a single top-level key', () => {
      interface T {
        a: string;
      }
      const d = path((m: T) => m.a).eq('x');
      expect(d._tag).toBe('JsonbPathDescriptor');
      expect(d.segments).toEqual([{ kind: 'key', value: 'a' }]);
      expect(d.op).toEqual({ eq: 'x' });
    });

    it('records a nested path', () => {
      interface T {
        a: { b: { c: string } };
      }
      const d = path((m: T) => m.a.b.c).eq('x');
      expect(d.segments).toEqual([
        { kind: 'key', value: 'a' },
        { kind: 'key', value: 'b' },
        { kind: 'key', value: 'c' },
      ]);
    });

    it('records integer segments as index kind for numeric array access', () => {
      interface T {
        tags: readonly string[];
      }
      const d = path((m: T) => m.tags[0]).eq('urgent');
      expect(d.segments).toEqual([
        { kind: 'key', value: 'tags' },
        { kind: 'index', value: 0 },
      ]);
    });

    it('treats leading-zero strings as text keys, not integer indices', () => {
      interface T {
        [k: string]: string;
      }
      const d = path((m: T) => m['007']).eq('agent');
      expect(d.segments).toEqual([{ kind: 'key', value: '007' }]);
    });
  });

  describe('terminal operators', () => {
    it('ne produces { ne: value }', () => {
      const d = path((m: { a: string }) => m.a).ne('x');
      expect(d.op).toEqual({ ne: 'x' });
    });

    it('gt produces { gt: value }', () => {
      const d = path((m: { a: number }) => m.a).gt(5);
      expect(d.op).toEqual({ gt: 5 });
    });

    it('in produces { in: values }', () => {
      const d = path((m: { a: string }) => m.a).in(['x', 'y']);
      expect(d.op).toEqual({ in: ['x', 'y'] });
    });

    it('contains produces { contains: value }', () => {
      const d = path((m: { a: string }) => m.a).contains('sub');
      expect(d.op).toEqual({ contains: 'sub' });
    });

    it('isNull(true) produces { isNull: true }', () => {
      const d = path((m: { a: string | null }) => m.a).isNull(true);
      expect(d.op).toEqual({ isNull: true });
    });
  });

  describe('hostile-callback safety', () => {
    it('ignores Symbol keys (Symbol.toPrimitive, iterator, etc.)', () => {
      interface T {
        a: string;
      }
      // @ts-expect-error — intentionally abuse the proxy
      const d = path(
        (m: T) => ((m as unknown as { [Symbol.iterator]: unknown })[Symbol.iterator], m.a),
      ).eq('x');
      // Symbol access should not contaminate segments.
      expect(d.segments).toEqual([{ kind: 'key', value: 'a' }]);
    });

    it('ignores internal string keys (then, toString, valueOf, etc.)', () => {
      interface T {
        a: string;
      }
      // Accessing .toString on the proxy should not be recorded as a segment.
      const d = path((m: T) => {
        // @ts-expect-error — probing internals intentionally
        const _ = m.toString;
        return m.a;
      }).eq('x');
      expect(d.segments).toEqual([{ kind: 'key', value: 'a' }]);
    });

    it('does not record toJSON access', () => {
      interface T {
        a: string;
      }
      const d = path((m: T) => {
        // @ts-expect-error — probing internals intentionally
        const _ = m.toJSON;
        return m.a;
      }).eq('x');
      expect(d.segments).toEqual([{ kind: 'key', value: 'a' }]);
    });
  });

  describe('invalid selectors throw with a descriptive message', () => {
    it('rejects m.a + m.b (arithmetic) instead of emitting garbage segments', () => {
      interface T {
        a: number;
        b: number;
      }
      expect(() => path((m: T) => m.a + m.b).eq(1)).toThrow(/direct property access/);
    });

    it('rejects `m` with no property access (depth zero)', () => {
      interface T {
        a: string;
      }
      // @ts-expect-error — m is not assignable to PathChain, but we probe runtime
      expect(() => path((m: T) => m).eq('x')).toThrow();
    });

    it('rejects a selector returning a constant', () => {
      interface T {
        a: string;
      }
      // @ts-expect-error — 'const' is not a TLeaf — probing runtime
      expect(() => path((_m: T) => 'const').eq('x')).toThrow(/direct property access/);
    });
  });
});
