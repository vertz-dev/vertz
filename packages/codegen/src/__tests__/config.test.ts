import { describe, expect, it } from 'bun:test';
import { defineCodegenConfig, resolveCodegenConfig, validateCodegenConfig } from '../config';

describe('defineCodegenConfig', () => {
  it('returns the config as-is (identity function for type safety)', () => {
    const config = defineCodegenConfig({
      generators: ['typescript'],
    });

    expect(config).toEqual({ generators: ['typescript'] });
  });
});

describe('resolveCodegenConfig', () => {
  it('returns default config when no config is provided', () => {
    const resolved = resolveCodegenConfig();

    expect(resolved.generators).toEqual(['typescript']);
    expect(resolved.outputDir).toBe('.vertz/generated');
  });

  it('preserves user-specified generators', () => {
    const resolved = resolveCodegenConfig({
      generators: ['typescript', 'cli'],
    });

    expect(resolved.generators).toEqual(['typescript', 'cli']);
  });

  it('preserves user-specified outputDir', () => {
    const resolved = resolveCodegenConfig({
      outputDir: 'custom/output',
    });

    expect(resolved.outputDir).toBe('custom/output');
  });

  it('preserves typescript options', () => {
    const resolved = resolveCodegenConfig({
      generators: ['typescript'],
      typescript: {
        schemas: false,
        clientName: 'createAPI',
      },
    });

    expect(resolved.typescript?.schemas).toBe(false);
    expect(resolved.typescript?.clientName).toBe('createAPI');
  });

  it('preserves cli options', () => {
    const resolved = resolveCodegenConfig({
      generators: ['cli'],
      cli: {
        enabled: true,
      },
    });

    expect(resolved.cli?.enabled).toBe(true);
  });

  it('preserves typescript publishable config', () => {
    const resolved = resolveCodegenConfig({
      generators: ['typescript'],
      typescript: {
        publishable: {
          name: '@acme/sdk',
          outputDir: 'packages/sdk',
          version: '1.0.0',
        },
      },
    });

    expect(resolved.typescript?.publishable?.name).toBe('@acme/sdk');
    expect(resolved.typescript?.publishable?.outputDir).toBe('packages/sdk');
    expect(resolved.typescript?.publishable?.version).toBe('1.0.0');
  });

  it('preserves cli publishable config', () => {
    const resolved = resolveCodegenConfig({
      generators: ['cli'],
      cli: {
        publishable: {
          name: '@acme/cli',
          outputDir: 'packages/cli',
          binName: 'acme',
        },
      },
    });

    expect(resolved.cli?.publishable?.name).toBe('@acme/cli');
    expect(resolved.cli?.publishable?.binName).toBe('acme');
  });
});

describe('validateCodegenConfig', () => {
  it('returns no errors for a valid minimal config', () => {
    const errors = validateCodegenConfig({
      generators: ['typescript'],
    });

    expect(errors).toEqual([]);
  });

  it('returns an error when generators array is empty', () => {
    const errors = validateCodegenConfig({
      generators: [],
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('generators');
  });

  it('returns an error for unknown generator names', () => {
    const errors = validateCodegenConfig({
      generators: ['unknown' as 'typescript'],
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('unknown');
  });

  it('returns no errors for valid generator names', () => {
    const errors = validateCodegenConfig({
      generators: ['typescript', 'cli'],
    });

    expect(errors).toEqual([]);
  });

  it('returns an error when typescript publishable is missing name', () => {
    const errors = validateCodegenConfig({
      generators: ['typescript'],
      typescript: {
        publishable: {
          name: '',
          outputDir: 'packages/sdk',
        },
      },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('name');
  });

  it('returns an error when typescript publishable is missing outputDir', () => {
    const errors = validateCodegenConfig({
      generators: ['typescript'],
      typescript: {
        publishable: {
          name: '@acme/sdk',
          outputDir: '',
        },
      },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('outputDir');
  });

  it('returns an error when cli publishable is missing binName', () => {
    const errors = validateCodegenConfig({
      generators: ['cli'],
      cli: {
        publishable: {
          name: '@acme/cli',
          outputDir: 'packages/cli',
          binName: '',
        },
      },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('binName');
  });

  it('returns multiple errors when multiple fields are invalid', () => {
    const errors = validateCodegenConfig({
      generators: [],
      typescript: {
        publishable: {
          name: '',
          outputDir: '',
        },
      },
    });

    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it('returns no errors when publishable is not configured', () => {
    const errors = validateCodegenConfig({
      generators: ['typescript'],
      typescript: {
        schemas: true,
      },
    });

    expect(errors).toEqual([]);
  });
});
