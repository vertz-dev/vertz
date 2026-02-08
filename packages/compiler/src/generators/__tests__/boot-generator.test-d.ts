import { describe, expectTypeOf, it } from 'vitest';
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
    expectTypeOf(_ok).toMatchTypeOf<BootModuleEntry>();
  });

  it('BootGenerator satisfies Generator interface', () => {
    expectTypeOf<BootGenerator>().toMatchTypeOf<Generator>();
  });
});
