/**
 * DTS Type Preservation Tests
 *
 * These tests validate that the built .d.ts files in each package's dist/
 * correctly preserve generic type parameters. This catches regressions where
 * the DTS bundler (bunup) erases generics and replaces them with
 * `Record<string, unknown>`, `unknown`, or bare interfaces.
 *
 * If `dts: { inferTypes: true }` is removed from any bunup.config.ts,
 * at least one of these tests MUST fail.
 *
 * Background: bunup's default DTS generation (`dts: true`) can erase generic
 * type parameters in certain configurations, replacing them with widened types.
 * The fix is `dts: { inferTypes: true }`, which uses TypeScript's inference to
 * preserve the original generic signatures.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const packagesDir = resolve(__dirname, '../../../');

function readDts(pkg: string, entry = 'index'): string {
  const path = resolve(packagesDir, pkg, 'dist', `${entry}.d.ts`);
  return readFileSync(path, 'utf-8');
}

// ---------------------------------------------------------------------------
// @vertz/db — the most critical package for type-safe generic preservation
// ---------------------------------------------------------------------------
describe('@vertz/db dist type preservation', () => {
  let dts: string;

  // Read once for all db tests
  beforeAll(() => {
    dts = readDts('db');
  });

  // ---- Generic type parameters on key types ----

  it('TypedFindManyOptions has a generic TEntry parameter', () => {
    expect(dts).toMatch(/type TypedFindManyOptions<\s*TEntry\s+extends\s+TableEntry/);
  });

  it('TypedFindOneOptions has a generic TEntry parameter', () => {
    expect(dts).toMatch(/type TypedFindOneOptions<\s*TEntry\s+extends\s+TableEntry/);
  });

  it('TypedCreateOptions has a generic TEntry parameter', () => {
    expect(dts).toMatch(/type TypedCreateOptions<\s*TEntry\s+extends\s+TableEntry/);
  });

  it('TypedUpdateOptions has a generic TEntry parameter', () => {
    expect(dts).toMatch(/type TypedUpdateOptions<\s*TEntry\s+extends\s+TableEntry/);
  });

  it('TypedDeleteOptions has a generic TEntry parameter', () => {
    expect(dts).toMatch(/type TypedDeleteOptions<\s*TEntry\s+extends\s+TableEntry/);
  });

  it('TypedUpsertOptions has a generic TEntry parameter', () => {
    expect(dts).toMatch(/type TypedUpsertOptions<\s*TEntry\s+extends\s+TableEntry/);
  });

  it('TypedCountOptions has a generic TEntry parameter', () => {
    expect(dts).toMatch(/type TypedCountOptions<\s*TEntry\s+extends\s+TableEntry/);
  });

  // ---- FilterType generic preservation ----

  it('FilterType has a TColumns generic parameter', () => {
    expect(dts).toMatch(/type FilterType<\s*TColumns\s+extends\s+ColumnRecord/);
  });

  it('FilterType uses InferColumnType (not erased to unknown)', () => {
    // When generics are erased, FilterType becomes a non-generic type with
    // `Record<string, unknown>` values instead of mapped column types
    expect(dts).toMatch(/FilterType[\s\S]*InferColumnType/);
  });

  // ---- InsertInput / UpdateInput generic preservation ----

  it('InsertInput has a generic TTable parameter', () => {
    expect(dts).toMatch(/type InsertInput<\s*TTable\s+extends\s+TableDef/);
  });

  it('UpdateInput has a generic TTable parameter', () => {
    expect(dts).toMatch(/type UpdateInput<\s*TTable\s+extends\s+TableDef/);
  });

  // ---- FindResult generic preservation ----

  it('FindResult has TTable, TOptions, and TRelations generic parameters', () => {
    expect(dts).toMatch(/type FindResult<\s*\n?\s*TTable\s+extends\s+TableDef/);
  });

  // ---- DatabaseInstance generic preservation ----

  it('DatabaseInstance has a TTables generic parameter', () => {
    expect(dts).toMatch(/interface DatabaseInstance<\s*TTables\s+extends\s+Record<string,\s*TableEntry>/);
  });

  it('DatabaseInstance.findMany has TName and TOptions generic parameters', () => {
    expect(dts).toMatch(
      /findMany<\s*\n?\s*TName\s+extends\s+keyof\s+TTables\s*&\s*string[\s\S]*?TOptions\s+extends\s+TypedFindManyOptions/,
    );
  });

  it('DatabaseInstance.findManyAndCount has TName and TOptions generic parameters', () => {
    expect(dts).toMatch(
      /findManyAndCount<\s*\n?\s*TName\s+extends\s+keyof\s+TTables\s*&\s*string[\s\S]*?TOptions\s+extends\s+TypedFindManyOptions/,
    );
  });

  it('DatabaseInstance.findOne has TName and TOptions generic parameters', () => {
    expect(dts).toMatch(
      /findOne<\s*\n?\s*TName\s+extends\s+keyof\s+TTables\s*&\s*string[\s\S]*?TOptions\s+extends\s+TypedFindOneOptions/,
    );
  });

  it('DatabaseInstance.create has TName and TOptions generic parameters', () => {
    expect(dts).toMatch(
      /create<\s*\n?\s*TName\s+extends\s+keyof\s+TTables\s*&\s*string[\s\S]*?TOptions\s+extends\s+TypedCreateOptions/,
    );
  });

  // ---- ColumnBuilder generic preservation ----

  it('ColumnBuilder has TType and TMeta generic parameters', () => {
    expect(dts).toMatch(/interface ColumnBuilder<\s*\n?\s*TType/);
  });

  // ---- TableDef generic preservation ----

  it('TableDef has a TColumns generic parameter', () => {
    expect(dts).toMatch(/interface TableDef<\s*TColumns\s+extends\s+ColumnRecord/);
  });

  // ---- TableEntry generic preservation ----

  it('TableEntry has TTable and TRelations generic parameters', () => {
    expect(dts).toMatch(
      /interface TableEntry<\s*\n?\s*TTable\s+extends\s+TableDef[\s\S]*?TRelations\s+extends\s+RelationsRecord/,
    );
  });

  // ---- createDb generic preservation ----

  it('createDb preserves TTables generic in return type', () => {
    expect(dts).toMatch(
      /declare function createDb<\s*TTables\s+extends\s+Record<string,\s*TableEntry>[\s\S]*?>\s*\([\s\S]*?\):\s*DatabaseInstance<TTables>/,
    );
  });

  // ---- createRegistry generic preservation ----

  it('createRegistry has TTables and TRelMap generic parameters', () => {
    expect(dts).toMatch(
      /declare function createRegistry<\s*\n?\s*TTables\s+extends\s+Record<string,\s*TableDef/,
    );
  });

  // ---- Negative assertions: patterns that indicate erased generics ----

  it('TypedFindManyOptions.where is NOT Record<string, unknown>', () => {
    // Extract TypedFindManyOptions definition
    const match = dts.match(/type TypedFindManyOptions[\s\S]*?};/);
    expect(match).not.toBeNull();
    if (match) {
      // where should use FilterType<...>, NOT Record<string, unknown>
      expect(match[0]).toMatch(/where\??\s*:\s*FilterType</);
      expect(match[0]).not.toMatch(/where\??\s*:\s*Record<string,\s*unknown>/);
    }
  });

  it('findMany return type is NOT Promise<unknown[]>', () => {
    // The findMany return should include FindResult, not just unknown[]
    const findManyMatch = dts.match(/findMany<[\s\S]*?>\([\s\S]*?\):\s*Promise<([\s\S]*?)>;/);
    expect(findManyMatch).not.toBeNull();
    if (findManyMatch) {
      expect(findManyMatch[1]).toMatch(/FindResult/);
      expect(findManyMatch[1]).not.toBe('unknown[]');
    }
  });

  // ---- Branded error types (complex generics) ----

  it('InvalidColumn has K and Table generic parameters', () => {
    expect(dts).toMatch(/type InvalidColumn<\s*\n?\s*K\s+extends\s+string[\s\S]*?Table\s+extends\s+string/);
  });

  it('InvalidFilterType has Col, Expected, and Got generic parameters', () => {
    expect(dts).toMatch(
      /type InvalidFilterType<\s*\n?\s*Col\s+extends\s+string[\s\S]*?Expected\s+extends\s+string[\s\S]*?Got\s+extends\s+string/,
    );
  });

  it('ValidateKeys has TKeys, TAllowed, and TTable generic parameters', () => {
    expect(dts).toMatch(
      /type ValidateKeys<\s*\n?\s*TKeys\s+extends\s+Record<string,\s*unknown>[\s\S]*?TAllowed\s+extends\s+string[\s\S]*?TTable\s+extends\s+string/,
    );
  });

  // ---- SelectNarrow / SelectOption preservation ----

  it('SelectNarrow has TColumns and TSelect generic parameters', () => {
    expect(dts).toMatch(/type SelectNarrow<\s*\n?\s*TColumns\s+extends\s+ColumnRecord/);
  });

  it('SelectOption has TColumns generic parameter', () => {
    expect(dts).toMatch(/type SelectOption<\s*TColumns\s+extends\s+ColumnRecord/);
  });

  // ---- OrderByType preservation ----

  it('OrderByType has TColumns generic parameter', () => {
    expect(dts).toMatch(/type OrderByType<\s*TColumns\s+extends\s+ColumnRecord/);
  });

  // ---- IncludeResolve preservation ----

  it('IncludeResolve has TRelations, TInclude, and _Depth generic parameters', () => {
    expect(dts).toMatch(
      /type IncludeResolve<\s*\n?\s*TRelations\s+extends\s+RelationsRecord/,
    );
  });

  // ---- d.table() preserves column generics ----

  it('d.table returns TableDef<TColumns> (not unparameterized TableDef)', () => {
    // d.table should return TableDef<TColumns>, not just TableDef
    expect(dts).toMatch(/table<\s*TColumns\s+extends\s+ColumnRecord\s*>\s*\([^)]*\):\s*TableDef<TColumns>/);
  });

  // ---- d.entry() preserves generics ----

  it('d.entry has generic parameters for table and relations', () => {
    expect(dts).toMatch(/entry<\s*TTable\s+extends\s+TableDef/);
  });

  // ---- d.ref.one / d.ref.many preserve generics ----

  it('d.ref.one returns RelationDef with target generic', () => {
    expect(dts).toMatch(/one<\s*TTarget\s+extends\s+TableDef[\s\S]*?>\s*\([\s\S]*?\):\s*RelationDef<TTarget/);
  });

  it('d.ref.many returns RelationDef or ManyRelationDef with target generic', () => {
    expect(dts).toMatch(/many<\s*TTarget\s+extends\s+TableDef[\s\S]*?>\s*\([\s\S]*?\):\s*(?:RelationDef|ManyRelationDef)<TTarget/);
  });
});

// ---------------------------------------------------------------------------
// @vertz/core — handler context and router generics
// ---------------------------------------------------------------------------
describe('@vertz/core dist type preservation', () => {
  let dts: string;

  beforeAll(() => {
    dts = readDts('core');
  });

  // ---- TypedHandlerCtx generic parameters ----

  it('TypedHandlerCtx has TParams, TQuery, THeaders, TBody, TMiddleware generics', () => {
    expect(dts).toMatch(
      /type TypedHandlerCtx<\s*\n?\s*TParams[\s\S]*?TQuery[\s\S]*?THeaders[\s\S]*?TBody[\s\S]*?TMiddleware/,
    );
  });

  // ---- HttpMethodFn generic preservation ----

  it('HttpMethodFn has TMiddleware generic parameter', () => {
    expect(dts).toMatch(/type HttpMethodFn<\s*TMiddleware\s+extends\s+Record<string,\s*unknown>/);
  });

  it('HttpMethodFn returns NamedRouterDef<TMiddleware>', () => {
    expect(dts).toMatch(/HttpMethodFn[\s\S]*?NamedRouterDef<TMiddleware>/);
  });

  // ---- NamedRouterDef generic preservation ----

  it('NamedRouterDef has TMiddleware generic parameter', () => {
    expect(dts).toMatch(/interface NamedRouterDef<\s*TMiddleware\s+extends\s+Record<string,\s*unknown>/);
  });

  // ---- RouteConfig generic parameters ----

  it('RouteConfig has TParams, TQuery, THeaders, TBody, TMiddleware generics', () => {
    expect(dts).toMatch(
      /interface RouteConfig<\s*\n?\s*TParams[\s\S]*?TQuery[\s\S]*?THeaders[\s\S]*?TBody[\s\S]*?TMiddleware/,
    );
  });

  // ---- MiddlewareDef generic preservation ----

  it('MiddlewareDef has TRequires and TProvides generic parameters', () => {
    expect(dts).toMatch(
      /interface MiddlewareDef<\s*\n?\s*TRequires\s+extends\s+Record<string,\s*unknown>[\s\S]*?TProvides\s+extends\s+Record<string,\s*unknown>/,
    );
  });

  // ---- createMiddleware preserves generics ----

  it('createMiddleware has TRequires and TProvides generic parameters', () => {
    expect(dts).toMatch(
      /declare function createMiddleware<\s*\n?\s*TRequires\s+extends\s+Record<string,\s*unknown>[\s\S]*?TProvides\s+extends\s+Record<string,\s*unknown>/,
    );
  });

  // ---- AccumulateProvides type-level recursion preserved ----

  it('AccumulateProvides uses recursive tuple pattern', () => {
    expect(dts).toMatch(
      /type AccumulateProvides<\s*T\s+extends\s+readonly\s+NamedMiddlewareDef/,
    );
  });

  // ---- AppBuilder generic preservation ----

  it('AppBuilder has TMiddlewareCtx generic parameter', () => {
    expect(dts).toMatch(/interface AppBuilder<\s*TMiddlewareCtx\s+extends\s+Record<string,\s*unknown>/);
  });

  // ---- ModuleDef generic preservation ----

  it('ModuleDef has TImports and TOptions generic parameters', () => {
    expect(dts).toMatch(
      /interface ModuleDef<\s*\n?\s*TImports\s+extends\s+Record<string,\s*unknown>[\s\S]*?TOptions\s+extends\s+Record<string,\s*unknown>/,
    );
  });

  // ---- NamedModuleDef generic preservation ----

  it('NamedModuleDef has TImports, TOptions, and TMiddleware generic parameters', () => {
    expect(dts).toMatch(
      /interface NamedModuleDef<\s*\n?\s*TImports\s+extends\s+Record<string,\s*unknown>[\s\S]*?TOptions\s+extends\s+Record<string,\s*unknown>[\s\S]*?TMiddleware\s+extends\s+Record<string,\s*unknown>/,
    );
  });

  // ---- createModuleDef generic preservation ----

  it('createModuleDef has TImports, TOptions, and TMiddleware generic parameters', () => {
    expect(dts).toMatch(
      /declare function createModuleDef<\s*\n?\s*TImports\s+extends\s+Record<string,\s*unknown>[\s\S]*?TOptions\s+extends\s+Record<string,\s*unknown>[\s\S]*?TMiddleware\s+extends\s+Record<string,\s*unknown>/,
    );
  });

  // ---- DeepReadonly preserved ----

  it('DeepReadonly type is present and generic', () => {
    expect(dts).toMatch(/type DeepReadonly<\s*T\s*>/);
  });

  // ---- ServiceDef generics preserved ----

  it('ServiceDef has TDeps, TState, and TMethods generic parameters', () => {
    expect(dts).toMatch(
      /interface ServiceDef<\s*\n?\s*TDeps[\s\S]*?TState[\s\S]*?TMethods/,
    );
  });
});

// ---------------------------------------------------------------------------
// @vertz/schema — Schema base class and format schema generics
// ---------------------------------------------------------------------------
describe('@vertz/schema dist type preservation', () => {
  let dts: string;

  beforeAll(() => {
    dts = readDts('schema');
  });

  // ---- Schema base class generics ----

  it('Schema has O and I generic parameters', () => {
    expect(dts).toMatch(/declare abstract class Schema<\s*\n?\s*O/);
  });

  // ---- StringSchema methods return `this` (not StringSchema) ----

  it('StringSchema.min returns this', () => {
    const match = dts.match(/declare class StringSchema[\s\S]*?(?=declare class)/);
    expect(match).not.toBeNull();
    if (match) {
      expect(match[0]).toMatch(/min\([\s\S]*?\):\s*this;/);
    }
  });

  it('StringSchema.max returns this', () => {
    const match = dts.match(/declare class StringSchema[\s\S]*?(?=declare class)/);
    expect(match).not.toBeNull();
    if (match) {
      expect(match[0]).toMatch(/max\([\s\S]*?\):\s*this;/);
    }
  });

  it('StringSchema.regex returns this', () => {
    const match = dts.match(/declare class StringSchema[\s\S]*?(?=declare class)/);
    expect(match).not.toBeNull();
    if (match) {
      expect(match[0]).toMatch(/regex\([\s\S]*?\):\s*this;/);
    }
  });

  it('StringSchema.trim returns this', () => {
    const match = dts.match(/declare class StringSchema[\s\S]*?(?=declare class)/);
    expect(match).not.toBeNull();
    if (match) {
      expect(match[0]).toMatch(/trim\(\):\s*this;/);
    }
  });

  it('StringSchema._clone returns this', () => {
    const match = dts.match(/declare class StringSchema[\s\S]*?(?=declare class)/);
    expect(match).not.toBeNull();
    if (match) {
      expect(match[0]).toMatch(/_clone\(\):\s*this;/);
    }
  });

  // ---- FormatSchema extends StringSchema ----

  it('FormatSchema extends StringSchema', () => {
    expect(dts).toMatch(/declare abstract class FormatSchema extends StringSchema/);
  });

  it('FormatSchema._clone returns this', () => {
    const match = dts.match(/declare abstract class FormatSchema[\s\S]*?(?=declare class)/);
    expect(match).not.toBeNull();
    if (match) {
      expect(match[0]).toMatch(/_clone\(\):\s*this;/);
    }
  });

  // ---- ObjectSchema generic preservation ----

  it('ObjectSchema has S generic parameter extending Shape', () => {
    expect(dts).toMatch(/declare class ObjectSchema<\s*S\s+extends\s+Shape/);
  });

  it('ObjectSchema.extend preserves generic', () => {
    expect(dts).toMatch(/extend<\s*E\s+extends\s+Shape\s*>/);
  });

  it('ObjectSchema.pick preserves generic', () => {
    expect(dts).toMatch(/pick<\s*K\s+extends\s+keyof\s+S\s*&\s*string\s*>/);
  });

  it('ObjectSchema.omit preserves generic', () => {
    expect(dts).toMatch(/omit<\s*K\s+extends\s+keyof\s+S\s*&\s*string\s*>/);
  });

  // ---- ArraySchema generic preservation ----

  it('ArraySchema has T generic parameter', () => {
    expect(dts).toMatch(/declare class ArraySchema<\s*T\s*>/);
  });

  // ---- MapSchema generic preservation ----

  it('MapSchema has K and V generic parameters', () => {
    expect(dts).toMatch(/declare class MapSchema<\s*\n?\s*K[\s\S]*?V\s*\n?\s*>/);
  });

  // ---- SetSchema generic preservation ----

  it('SetSchema has V generic parameter', () => {
    expect(dts).toMatch(/declare class SetSchema<\s*V\s*>/);
  });

  // ---- TupleSchema generic preservation ----

  it('TupleSchema has T generic parameter extending TupleItems', () => {
    expect(dts).toMatch(/declare class TupleSchema<\s*T\s+extends\s+TupleItems\s*>/);
  });

  // ---- UnionSchema generic preservation ----

  it('UnionSchema has T generic parameter', () => {
    expect(dts).toMatch(/declare class UnionSchema<\s*T\s+extends\s+UnionOptions\s*>/);
  });

  // ---- EnumSchema generic preservation ----

  it('EnumSchema has T generic parameter', () => {
    expect(dts).toMatch(/declare class EnumSchema<\s*T\s+extends\s+readonly\s+\[string/);
  });

  // ---- IntersectionSchema generic preservation ----

  it('IntersectionSchema has L and R generic parameters', () => {
    expect(dts).toMatch(
      /declare class IntersectionSchema<\s*\n?\s*L\s+extends\s+SchemaAny[\s\S]*?R\s+extends\s+SchemaAny/,
    );
  });

  // ---- Infer / Output / Input type utilities ----

  it('Infer type utility references _output', () => {
    expect(dts).toMatch(/type Infer<\s*T\s+extends\s+SchemaAny\s*>\s*=\s*T\[["']_output["']\]/);
  });

  it('Output type utility references _output', () => {
    expect(dts).toMatch(/type Output<\s*T\s+extends\s+SchemaAny\s*>\s*=\s*T\[["']_output["']\]/);
  });

  it('Input type utility references _input', () => {
    expect(dts).toMatch(/type Input<\s*T\s+extends\s+SchemaAny\s*>\s*=\s*T\[["']_input["']\]/);
  });

  // ---- s factory preserves generic return types ----

  it('s.object returns ObjectSchema<T> (generic, not bare ObjectSchema)', () => {
    expect(dts).toMatch(/object:\s*<\s*T\s+extends\s+Record<string,\s*SchemaAny>\s*>\s*\(shape:\s*T\)\s*=>\s*ObjectSchema<T>/);
  });

  it('s.array returns ArraySchema<T> (generic)', () => {
    expect(dts).toMatch(/array:\s*<\s*T\s*>\s*\(itemSchema:\s*Schema<T>\)\s*=>\s*ArraySchema<T>/);
  });

  it('s.enum returns EnumSchema<T> (generic)', () => {
    expect(dts).toMatch(/enum:\s*<\s*T\s+extends\s+readonly\s+\[string/);
  });

  it('s.literal returns LiteralSchema<T> (generic)', () => {
    expect(dts).toMatch(/literal:\s*<\s*T\s+extends/);
  });

  // ---- CoercedStringSchema extends StringSchema ----

  it('CoercedStringSchema extends StringSchema', () => {
    expect(dts).toMatch(/declare class CoercedStringSchema extends StringSchema/);
  });

  it('CoercedStringSchema._clone returns this', () => {
    const match = dts.match(/declare class CoercedStringSchema[\s\S]*?(?=declare class)/);
    expect(match).not.toBeNull();
    if (match) {
      expect(match[0]).toMatch(/_clone\(\):\s*this;/);
    }
  });
});
