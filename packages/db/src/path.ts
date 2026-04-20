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

/** Operators available on every leaf type. */
interface PathCommonOps<TLeaf> {
  eq(value: TLeaf): JsonbPathDescriptor;
  ne(value: TLeaf): JsonbPathDescriptor;
  in(values: readonly TLeaf[]): JsonbPathDescriptor;
  notIn(values: readonly TLeaf[]): JsonbPathDescriptor;
  isNull(value: boolean): JsonbPathDescriptor;
}

/** String-only operators; available only when the leaf is assignable to string. */
interface PathStringOps {
  contains(value: string): JsonbPathDescriptor;
  startsWith(value: string): JsonbPathDescriptor;
  endsWith(value: string): JsonbPathDescriptor;
}

/** Comparison operators; available only when the leaf is number / bigint / Date. */
interface PathNumericOps<TLeaf> {
  gt(value: NonNullable<TLeaf>): JsonbPathDescriptor;
  gte(value: NonNullable<TLeaf>): JsonbPathDescriptor;
  lt(value: NonNullable<TLeaf>): JsonbPathDescriptor;
  lte(value: NonNullable<TLeaf>): JsonbPathDescriptor;
}

/**
 * Terminal operator chain. Operator availability narrows per leaf type:
 * - string / string literal / nullable-string → common + string ops.
 * - number / bigint / Date → common + numeric comparison ops.
 * - boolean / object / array → common ops only.
 * The runtime shape (see `makeChain`) is permissive; the type narrows at the API surface.
 */
export type PathChain<TLeaf> = PathCommonOps<TLeaf> &
  ([NonNullable<TLeaf>] extends [string] ? PathStringOps : unknown) &
  ([NonNullable<TLeaf>] extends [number | bigint | Date] ? PathNumericOps<TLeaf> : unknown);

/** Non-recording property accesses that JS runtimes probe on any object. */
const INTERNAL_STRING_KEYS = new Set<string>([
  'then',
  'toString',
  'valueOf',
  'toJSON',
  'constructor',
]);

const INTEGER_INDEX_RE = /^(?:0|[1-9]\d*)$/;

/**
 * Runtime-side permissive chain shape. Holds every terminal operator; the
 * public `PathChain<TLeaf>` type narrows which subset is callable per leaf.
 */
interface PermissiveChain {
  eq(value: unknown): JsonbPathDescriptor;
  ne(value: unknown): JsonbPathDescriptor;
  gt(value: unknown): JsonbPathDescriptor;
  gte(value: unknown): JsonbPathDescriptor;
  lt(value: unknown): JsonbPathDescriptor;
  lte(value: unknown): JsonbPathDescriptor;
  in(values: readonly unknown[]): JsonbPathDescriptor;
  notIn(values: readonly unknown[]): JsonbPathDescriptor;
  contains(value: string): JsonbPathDescriptor;
  startsWith(value: string): JsonbPathDescriptor;
  endsWith(value: string): JsonbPathDescriptor;
  isNull(value: boolean): JsonbPathDescriptor;
}

function makeChain(segments: readonly PathSegment[]): PermissiveChain {
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
 * Per-proxy segment registry — keyed on the proxy object itself. Each proxy
 * is associated with its accumulated segment list at creation time; child
 * proxies close over the parent's segments so every `get` appends correctly.
 *
 * If the selector returns anything other than a child proxy (a primitive
 * from coercion, a plain object, `m.a + m.b` triggering valueOf coercion
 * which throws), we reject the call instead of emitting garbage segments.
 */
const SEGMENTS_FOR_PROXY = new WeakMap<object, readonly PathSegment[]>();

const INVALID_SELECTOR_MESSAGE =
  'path() selector must be a direct property access like (m) => m.x.y — ' +
  'arithmetic or other non-access expressions are not allowed.';

function makeRecorderProxy(segments: readonly PathSegment[]): object {
  const proxy: object = new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key === 'symbol') return undefined;
        if (INTERNAL_STRING_KEYS.has(key)) return undefined;
        const segment: PathSegment = INTEGER_INDEX_RE.test(key)
          ? { kind: 'index', value: Number(key) }
          : { kind: 'key', value: key };
        return makeRecorderProxy([...segments, segment]);
      },
    },
  );
  SEGMENTS_FOR_PROXY.set(proxy, segments);
  return proxy;
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
 *
 * The selector MUST be a direct property access (`(m) => m.x.y`). Arithmetic
 * or other expressions (`(m) => m.a + m.b`) throw because the Proxy can't
 * unambiguously record the intended path.
 */
export function path<T, TLeaf>(selector: (m: T) => TLeaf): PathChain<TLeaf> {
  const root = makeRecorderProxy([]);
  let returned: unknown;
  try {
    returned = selector(root as T);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`${INVALID_SELECTOR_MESSAGE} Cause: ${message}`);
  }
  if (typeof returned !== 'object' || returned === null) {
    throw new Error(INVALID_SELECTOR_MESSAGE);
  }
  const segments = SEGMENTS_FOR_PROXY.get(returned);
  if (!segments || segments.length === 0) {
    throw new Error(
      'path() selector must access at least one property — e.g. (m) => m.x, not (m) => m.',
    );
  }
  // Runtime chain has every operator (PermissiveChain); the public type
  // narrows the subset callable for TLeaf. Two `as` hops are needed because
  // PathChain<TLeaf> is a conditional intersection, not a supertype of
  // PermissiveChain.
  return makeChain(segments) as unknown as PathChain<TLeaf>;
}
