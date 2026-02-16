import { describe, expectTypeOf, it } from 'vitest';

describe('SchemaRegistryGenerator type-level tests', () => {
  it('SchemaRegistryEntry requires name field', () => {
    // @ts-expect-error — missing required fields
    const _bad = { importPath: 'src/test.ts', variableName: 'test' };
  });
  it('SchemaRegistryEntry id is optional', () => {
    const _ok = {
      name: 'testSchema',
      importPath: 'src/test.ts',
      variableName: 'testSchema',
    };
    expectTypeOf(_ok).toMatchTypeOf();
  });
  it('SchemaRegistryGenerator satisfies Generator interface', () => {
    expectTypeOf().toMatchTypeOf();
  });
});
//# sourceMappingURL=schema-registry-generator.test-d.js.map
