import { describe, expect, it } from 'vitest';
import { createEmptyAppIR, createEmptyDependencyGraph } from '../../ir/builder';
import type { AppIR, DependencyGraphIR, ModuleIR, ServiceIR } from '../../ir/types';
import { ModuleValidator } from '../module-validator';

function makeService(overrides: Partial<ServiceIR> & { name: string }): ServiceIR {
  return {
    moduleName: 'test',
    inject: [],
    methods: [],
    sourceFile: 'test.ts',
    sourceLine: 1,
    sourceColumn: 1,
    ...overrides,
  };
}

function makeModule(overrides: Partial<ModuleIR> & { name: string }): ModuleIR {
  return {
    imports: [],
    services: [],
    routers: [],
    exports: [],
    sourceFile: 'test.ts',
    sourceLine: 1,
    sourceColumn: 1,
    ...overrides,
  };
}

function makeIR(modules: ModuleIR[], depGraph?: Partial<DependencyGraphIR>): AppIR {
  return {
    ...createEmptyAppIR(),
    modules,
    dependencyGraph: { ...createEmptyDependencyGraph(), ...depGraph },
  };
}

describe('ModuleValidator', () => {
  describe('exports subset of services', () => {
    it('no diagnostics when exports are a subset of services', async () => {
      const validator = new ModuleValidator();
      const ir = makeIR([
        makeModule({
          name: 'user',
          services: [
            makeService({ name: 'userService', moduleName: 'user' }),
            makeService({ name: 'authService', moduleName: 'user' }),
          ],
          exports: ['userService'],
        }),
      ]);
      const diags = await validator.validate(ir);
      expect(diags).toEqual([]);
    });

    it('no diagnostics when exports equal services', async () => {
      const validator = new ModuleValidator();
      const ir = makeIR([
        makeModule({
          name: 'user',
          services: [
            makeService({ name: 'userService', moduleName: 'user' }),
            makeService({ name: 'authService', moduleName: 'user' }),
          ],
          exports: ['userService', 'authService'],
        }),
      ]);
      const diags = await validator.validate(ir);
      expect(diags).toEqual([]);
    });

    it('emits error when export is not in services', async () => {
      const validator = new ModuleValidator();
      const ir = makeIR([
        makeModule({
          name: 'user',
          services: [makeService({ name: 'userService', moduleName: 'user' })],
          exports: ['authService'],
        }),
      ]);
      const diags = await validator.validate(ir);
      expect(diags).toHaveLength(1);
      expect(diags.at(0)?.severity).toBe('error');
      expect(diags.at(0)?.code).toBe('VERTZ_MODULE_EXPORT_INVALID');
      expect(diags.at(0)?.message).toContain("Module 'user'");
      expect(diags.at(0)?.message).toContain("'authService'");
    });

    it('emits error for each invalid export', async () => {
      const validator = new ModuleValidator();
      const ir = makeIR([
        makeModule({
          name: 'user',
          services: [makeService({ name: 'a', moduleName: 'user' })],
          exports: ['b', 'c'],
        }),
      ]);
      const diags = await validator.validate(ir);
      const exportErrors = diags.filter((d) => d.code === 'VERTZ_MODULE_EXPORT_INVALID');
      expect(exportErrors).toHaveLength(2);
    });
  });

  describe('service ownership', () => {
    it('no diagnostics when services belong to their module', async () => {
      const validator = new ModuleValidator();
      const ir = makeIR([
        makeModule({
          name: 'user',
          services: [makeService({ name: 'userService', moduleName: 'user' })],
        }),
      ]);
      const diags = await validator.validate(ir);
      expect(diags).toEqual([]);
    });

    it('emits error when service has wrong module name', async () => {
      const validator = new ModuleValidator();
      const ir = makeIR([
        makeModule({
          name: 'user',
          services: [makeService({ name: 'userService', moduleName: 'todo' })],
        }),
      ]);
      const diags = await validator.validate(ir);
      expect(diags).toHaveLength(1);
      expect(diags.at(0)?.severity).toBe('error');
      expect(diags.at(0)?.message).toContain("Service 'userService'");
      expect(diags.at(0)?.message).toContain("'todo'");
      expect(diags.at(0)?.message).toContain("'user'");
    });
  });

  describe('circular module dependencies', () => {
    it('no diagnostics for acyclic module graph', async () => {
      const validator = new ModuleValidator();
      const ir = makeIR([], { circularDependencies: [] });
      const diags = await validator.validate(ir);
      expect(diags).toEqual([]);
    });

    it('emits error for circular dependency', async () => {
      const validator = new ModuleValidator();
      const ir = makeIR([], { circularDependencies: [['user', 'auth']] });
      const diags = await validator.validate(ir);
      expect(diags).toHaveLength(1);
      expect(diags.at(0)?.severity).toBe('error');
      expect(diags.at(0)?.code).toBe('VERTZ_MODULE_CIRCULAR');
      expect(diags.at(0)?.message).toContain('user');
      expect(diags.at(0)?.message).toContain('auth');
    });

    it('emits one error per cycle', async () => {
      const validator = new ModuleValidator();
      const ir = makeIR([], {
        circularDependencies: [
          ['a', 'b'],
          ['c', 'd'],
        ],
      });
      const diags = await validator.validate(ir);
      const circularErrors = diags.filter((d) => d.code === 'VERTZ_MODULE_CIRCULAR');
      expect(circularErrors).toHaveLength(2);
    });

    it('includes suggestion for breaking circular dependency', async () => {
      const validator = new ModuleValidator();
      const ir = makeIR([], { circularDependencies: [['user', 'auth']] });
      const diags = await validator.validate(ir);
      expect(diags.at(0)?.suggestion).toContain('Break the cycle');
    });
  });
});
