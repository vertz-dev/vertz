import { describe, expect, it } from '@vertz/test';
import { resolveExternals } from '../externals';

describe('resolveExternals', () => {
  it('includes dependencies as external', () => {
    const result = resolveExternals({
      dependencies: { lodash: '^4.0.0', express: '^5.0.0' },
    });
    expect(result).toContain('lodash');
    expect(result).toContain('express');
  });

  it('includes peerDependencies as external', () => {
    const result = resolveExternals({
      peerDependencies: { react: '^18.0.0' },
    });
    expect(result).toContain('react');
  });

  it('does not include devDependencies', () => {
    const result = resolveExternals({
      devDependencies: { vitest: '^1.0.0' },
    });
    expect(result).not.toContain('vitest');
  });

  it('merges config externals', () => {
    const result = resolveExternals(
      { dependencies: { lodash: '^4.0.0' } },
      ['bun:sqlite', 'bun:test'],
    );
    expect(result).toContain('lodash');
    expect(result).toContain('bun:sqlite');
    expect(result).toContain('bun:test');
  });

  it('deduplicates entries', () => {
    const result = resolveExternals(
      { dependencies: { lodash: '^4.0.0' } },
      ['lodash'],
    );
    const lodashCount = result.filter((e) => e === 'lodash').length;
    expect(lodashCount).toBe(1);
  });

  it('returns empty array when no deps', () => {
    const result = resolveExternals({});
    expect(result).toEqual([]);
  });

  it('returns config externals when no deps', () => {
    const result = resolveExternals({}, ['bun:test']);
    expect(result).toEqual(['bun:test']);
  });

  it('combines dependencies and peerDependencies', () => {
    const result = resolveExternals({
      dependencies: { '@vertz/core': 'workspace:*' },
      peerDependencies: { '@vertz/ui': 'workspace:*' },
    });
    expect(result).toContain('@vertz/core');
    expect(result).toContain('@vertz/ui');
  });
});
