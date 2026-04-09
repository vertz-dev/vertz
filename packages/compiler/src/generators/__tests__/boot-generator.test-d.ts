import { describe, it } from '@vertz/test';
import type { Generator } from '../base-generator';
import type { BootGenerator, BootManifest, BootModuleEntry } from '../boot-generator';

describe('BootGenerator type-level tests', () => {
  it('BootManifest requires initializationOrder', () => {
    // @ts-expect-error — missing initializationOrder
    const _bad: BootManifest = { modules: [], globalMiddleware: [] };
  });

  it('BootModuleEntry options is optional', () => {
    const _ok: BootModuleEntry = {
      name: 'core',
      importPath: 'src/core.ts',
      variableName: 'coreModule',
    };
    const _check: BootModuleEntry = _ok;
    void _check;
  });

  it('BootGenerator satisfies Generator interface', () => {
    const _check: Generator = {} as BootGenerator;
    void _check;
  });
});
