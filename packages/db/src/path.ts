/**
 * Typed JSONB path builder — `path((m: T) => m.x.y).eq(value)`.
 *
 * Parameter-annotation inference drives `T`. Each property access on the
 * proxy records a path segment; terminal operators (eq/ne/in/...) produce
 * a JsonbPathDescriptor consumed by the WHERE clause builder.
 *
 * Postgres-only at the type level (the descriptor is dialect-branded via the
 * filter-slot type). Runtime emits `col->'k'->>'leaf' <op> $1` (or unquoted
 * integer segments for array indexing).
 */

/**
 * A single path segment. `kind: 'key'` emits a quoted text key (`->'k'`);
 * `kind: 'index'` emits an unquoted integer index (`->N`) for JSONB array
 * access (Postgres semantics — `->'0'` on an array returns NULL).
 */
export type PathSegment =
  | { readonly kind: 'key'; readonly value: string }
  | { readonly kind: 'index'; readonly value: number };

/** Terminal operator shape produced by a PathChain method. */
export interface PathFilterOp {
  readonly eq?: unknown;
  readonly ne?: unknown;
  readonly gt?: unknown;
  readonly gte?: unknown;
  readonly lt?: unknown;
  readonly lte?: unknown;
  readonly in?: readonly unknown[];
  readonly notIn?: readonly unknown[];
  readonly contains?: string;
  readonly startsWith?: string;
  readonly endsWith?: string;
  readonly isNull?: boolean;
}

/**
 * Descriptor produced by `path(...).<op>(value)`. Consumed by the WHERE
 * builder when it encounters a value with `_tag: 'JsonbPathDescriptor'`
 * in a filter slot.
 */
export interface JsonbPathDescriptor {
  readonly _tag: 'JsonbPathDescriptor';
  readonly segments: readonly PathSegment[];
  readonly op: PathFilterOp;
}

export function isJsonbPathDescriptor(value: unknown): value is JsonbPathDescriptor {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { _tag?: unknown })._tag === 'JsonbPathDescriptor'
  );
}

/** Terminal operator chain. Runtime shape is permissive; TS layer narrows per leaf. */
export interface PathChain<TLeaf> {
  eq(value: TLeaf): JsonbPathDescriptor;
  ne(value: TLeaf): JsonbPathDescriptor;
  gt(value: NonNullable<TLeaf>): JsonbPathDescriptor;
  gte(value: NonNullable<TLeaf>): JsonbPathDescriptor;
  lt(value: NonNullable<TLeaf>): JsonbPathDescriptor;
  lte(value: NonNullable<TLeaf>): JsonbPathDescriptor;
  in(values: readonly TLeaf[]): JsonbPathDescriptor;
  notIn(values: readonly TLeaf[]): JsonbPathDescriptor;
  contains(value: string): JsonbPathDescriptor;
  startsWith(value: string): JsonbPathDescriptor;
  endsWith(value: string): JsonbPathDescriptor;
  isNull(value: boolean): JsonbPathDescriptor;
}

/** Non-recording property accesses that JS runtimes probe on any object. */
const INTERNAL_STRING_KEYS = new Set<string>([
  'then',
  'toString',
  'valueOf',
  'toJSON',
  'constructor',
  'Symbol(Symbol.toPrimitive)',
]);

const INTEGER_INDEX_RE = /^(?:0|[1-9]\d*)$/;

function makeChain(segments: readonly PathSegment[]): PathChain<unknown> {
  const mk = (op: PathFilterOp): JsonbPathDescriptor => ({
    _tag: 'JsonbPathDescriptor',
    segments,
    op,
  });
  return {
    eq: (value) => mk({ eq: value }),
    ne: (value) => mk({ ne: value }),
    gt: (value) => mk({ gt: value }),
    gte: (value) => mk({ gte: value }),
    lt: (value) => mk({ lt: value }),
    lte: (value) => mk({ lte: value }),
    in: (values) => mk({ in: values }),
    notIn: (values) => mk({ notIn: values }),
    contains: (value) => mk({ contains: value }),
    startsWith: (value) => mk({ startsWith: value }),
    endsWith: (value) => mk({ endsWith: value }),
    isNull: (value) => mk({ isNull: value }),
  };
}

/**
 * Build a typed JSONB path filter.
 *
 * ```ts
 * import { path } from '@vertz/db';
 * await pg.install.list({
 *   where: { meta: path((m: InstallMeta) => m.settings.theme).eq('dark') },
 * });
 * ```
 *
 * Pass the JSONB column's payload type as the selector parameter annotation.
 * The leaf type flows through to the terminal operator's operand via TS's
 * normal return-type inference — no explicit generic required.
 */
export function path<T, TLeaf>(selector: (m: T) => TLeaf): PathChain<TLeaf> {
  const segments: PathSegment[] = [];
  const handler: ProxyHandler<object> = {
    get(_target, key) {
      if (typeof key === 'symbol') return undefined;
      if (INTERNAL_STRING_KEYS.has(key)) return undefined;
      if (INTEGER_INDEX_RE.test(key)) {
        segments.push({ kind: 'index', value: Number(key) });
      } else {
        segments.push({ kind: 'key', value: key });
      }
      return new Proxy({}, handler);
    },
  };
  const proxy = new Proxy({}, handler) as T;
  selector(proxy);
  return makeChain(segments) as PathChain<TLeaf>;
}
