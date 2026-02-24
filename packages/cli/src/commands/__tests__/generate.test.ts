import { describe, expect, it } from 'bun:test';
import { generateAction } from '../generate';

describe('generateAction', () => {
  it('generates module files for type module', () => {
    const result = generateAction({
      type: 'module',
      name: 'order',
      sourceDir: 'src',
    });
    expect(result.success).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files.some((f) => f.path.includes('module-def'))).toBe(true);
  });

  it('generates service file for type service', () => {
    const result = generateAction({
      type: 'service',
      name: 'order',
      module: 'order',
      sourceDir: 'src',
    });
    expect(result.success).toBe(true);
    expect(result.files[0]?.path).toContain('.service.ts');
  });

  it('generates router file for type router', () => {
    const result = generateAction({
      type: 'router',
      name: 'order',
      module: 'order',
      sourceDir: 'src',
    });
    expect(result.success).toBe(true);
    expect(result.files[0]?.path).toContain('.router.ts');
  });

  it('generates schema file for type schema', () => {
    const result = generateAction({
      type: 'schema',
      name: 'order',
      module: 'order',
      sourceDir: 'src',
    });
    expect(result.success).toBe(true);
    expect(result.files[0]?.path).toContain('.schema.ts');
  });

  it('fails when service type is missing module', () => {
    const result = generateAction({
      type: 'service',
      name: 'order',
      sourceDir: 'src',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('module');
    }
  });

  it('fails when router type is missing module', () => {
    const result = generateAction({
      type: 'router',
      name: 'order',
      sourceDir: 'src',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('module');
    }
  });

  it('fails when schema type is missing module', () => {
    const result = generateAction({
      type: 'schema',
      name: 'order',
      sourceDir: 'src',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('module');
    }
  });

  it('fails for unknown generator type', () => {
    const result = generateAction({
      type: 'unknown',
      name: 'order',
      sourceDir: 'src',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Unknown generator type');
    }
  });
});
