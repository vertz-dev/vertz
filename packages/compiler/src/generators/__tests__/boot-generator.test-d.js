import { describe, expectTypeOf, it } from 'vitest';

describe('BootGenerator type-level tests', () => {
  it('BootManifest requires initializationOrder', () => {
    // @ts-expect-error — missing initializationOrder
    const _bad = { modules: [], globalMiddleware: [] };
  });
  it('BootModuleEntry options is optional', () => {
    const _ok = {
      name: 'core',
      importPath: 'src/core.ts',
      variableName: 'coreModule',
    };
    expectTypeOf(_ok).toMatchTypeOf();
  });
  it('BootGenerator satisfies Generator interface', () => {
    expectTypeOf().toMatchTypeOf();
  });
});
//# sourceMappingURL=boot-generator.test-d.js.map
