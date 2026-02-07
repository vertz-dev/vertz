import { describe, expectTypeOf, it } from 'vitest';
import type { Generator } from '../base-generator';
import type { SchemaRegistryEntry, SchemaRegistryGenerator } from '../schema-registry-generator';

describe('SchemaRegistryGenerator type-level tests', () => {
  it('SchemaRegistryEntry requires name field', () => {
    // @ts-expect-error — missing required fields
    const _bad: SchemaRegistryEntry = { importPath: 'src/test.ts', variableName: 'test' };
  });

  it('SchemaRegistryEntry id is optional', () => {
    const _ok: SchemaRegistryEntry = {
      name: 'testSchema',
      importPath: 'src/test.ts',
      variableName: 'testSchema',
    };
    expectTypeOf(_ok).toMatchTypeOf<SchemaRegistryEntry>();
  });

  it('SchemaRegistryGenerator satisfies Generator interface', () => {
    expectTypeOf<SchemaRegistryGenerator>().toMatchTypeOf<Generator>();
  });
});
