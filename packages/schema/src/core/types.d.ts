import type { ParseError } from './errors';
export declare enum SchemaType {
  String = 'string',
  Number = 'number',
  BigInt = 'bigint',
  Boolean = 'boolean',
  Date = 'date',
  Symbol = 'symbol',
  Undefined = 'undefined',
  Null = 'null',
  Void = 'void',
  Any = 'any',
  Unknown = 'unknown',
  Never = 'never',
  NaN = 'nan',
  Object = 'object',
  Array = 'array',
  Tuple = 'tuple',
  Enum = 'enum',
  Union = 'union',
  DiscriminatedUnion = 'discriminatedUnion',
  Intersection = 'intersection',
  Record = 'record',
  Map = 'map',
  Set = 'set',
  Literal = 'literal',
  Lazy = 'lazy',
  Custom = 'custom',
  InstanceOf = 'instanceof',
  File = 'file',
}
export interface SchemaMetadata {
  type: SchemaType;
  id: string | undefined;
  description: string | undefined;
  meta: Record<string, unknown> | undefined;
  examples: unknown[];
}
export type SafeParseResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: ParseError;
    };
//# sourceMappingURL=types.d.ts.map
