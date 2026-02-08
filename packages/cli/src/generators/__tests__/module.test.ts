import { describe, expect, it } from 'vitest';
import type { GeneratedFile } from '../../config/defaults';
import { generateModule } from '../module';

describe('generateModule', () => {
  it('generates module-def and module files', () => {
    const files = generateModule('order', 'src');
    expect(files).toHaveLength(2);
  });

  it('generates module-def at correct path', () => {
    const files = generateModule('order', 'src');
    const moduleDef = files.find((f) => f.path.includes('module-def'));
    expect(moduleDef?.path).toBe('src/modules/order/order.module-def.ts');
  });

  it('generates module at correct path', () => {
    const files = generateModule('order', 'src');
    const mod = files.find((f) => f.path.endsWith('.module.ts'));
    expect(mod?.path).toBe('src/modules/order/order.module.ts');
  });

  it('uses kebab-case for directory and file names', () => {
    const files = generateModule('UserAuth', 'src');
    const moduleDef = files.find((f) => f.path.includes('module-def'));
    expect(moduleDef?.path).toBe('src/modules/user-auth/user-auth.module-def.ts');
  });

  it('module-def content exports createModuleDef call', () => {
    const files = generateModule('order', 'src');
    const moduleDef = files.find((f) => f.path.includes('module-def'));
    expect(moduleDef?.content).toContain('createModuleDef');
  });

  it('module content exports createModule call', () => {
    const files = generateModule('order', 'src');
    const mod = files.find((f) => f.path.endsWith('.module.ts'));
    expect(mod?.content).toContain('createModule');
  });

  it('uses PascalCase for type names in content', () => {
    const files = generateModule('user-auth', 'src');
    const moduleDef = files.find((f) => f.path.includes('module-def'));
    expect(moduleDef?.content).toContain('UserAuth');
  });
});
