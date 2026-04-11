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

  it('includes devDependencies as external', () => {
    const result = resolveExternals({
      devDependencies: { vitest: '^1.0.0' },
    });
    expect(result).toContain('vitest');
    expect(result).toContain('vitest/*');
  });

  it('includes optionalDependencies as external', () => {
    const result = resolveExternals({
      optionalDependencies: { postgres: '^3.4.0' },
    });
    expect(result).toContain('postgres');
    expect(result).toContain('postgres/*');
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

  it('adds subpath wildcard patterns for dependencies', () => {
    const result = resolveExternals({
      dependencies: { '@vertz/ui': 'workspace:*' },
    });
    expect(result).toContain('@vertz/ui');
    expect(result).toContain('@vertz/ui/*');
  });

  it('adds subpath wildcard patterns for peerDependencies', () => {
    const result = resolveExternals({
      peerDependencies: { '@vertz/core': 'workspace:*' },
    });
    expect(result).toContain('@vertz/core');
    expect(result).toContain('@vertz/core/*');
  });
});
