/**
 * Typed CSS variable helper.
 *
 * `token.<namespace>.<key>` stringifies to `var(--<namespace>-<key>)`.
 * `token.color.<name>.<shade>` stringifies to `var(--color-<name>-<shade>)`.
 *
 * No runtime theme registry: every access returns a token proxy deterministically.
 *
 * ## Type narrowing via augmentation
 *
 * Per-namespace augmentation points let projects narrow the vanilla
 * `TokenPath` fallback to their concrete theme shape:
 *
 * ```ts
 * declare module '@vertz/ui' {
 *   interface VertzThemeColors {
 *     background: string;
 *     primary: { 500: string; 700: string };
 *   }
 * }
 * ```
 *
 * Without augmentation, each namespace is `TokenPath` — a string whose
 * sub-indexing is restricted to the framework's known scale keys (palette
 * shades, Tailwind t-shirt sizes, named spacing values, etc.). This finite
 * key set is used instead of an open `[key: string]` index signature so that
 * `noUncheckedIndexedAccess: true` consumers don't see `T | undefined` at
 * every sub-access. After augmentation, unknown keys fail typecheck.
 */

export const TOKEN_BRAND: unique symbol = Symbol.for('vertz.ui.token') as never;

/**
 * Full set of keys valid on a `TokenPath`. This is the union of every
 * framework-defined scale key across color, spacing, radius, shadow, and
 * font sub-namespaces. Extending the fallback to a finite union (instead
 * of `[key: string]`) avoids `noUncheckedIndexedAccess` widening each
 * sub-access to `TokenPath | undefined`.
 */
type TokenKey =
  // Palette shade numbers (Tailwind).
  | '50'
  | '100'
  | '200'
  | '300'
  | '400'
  | '500'
  | '600'
  | '700'
  | '800'
  | '900'
  | '950'
  // Spacing scale values.
  | '0'
  | '0.5'
  | '1'
  | '1.5'
  | '2'
  | '2.5'
  | '3'
  | '3.5'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | '11'
  | '12'
  | '14'
  | '16'
  | '20'
  | '24'
  | '28'
  | '32'
  | '36'
  | '40'
  | '44'
  | '48'
  | '52'
  | '56'
  | '60'
  | '64'
  | '72'
  | '80'
  | '96'
  // T-shirt sizes (shared by radius, shadow, font-size, size keywords).
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | '4xl'
  | '5xl'
  | '6xl'
  | '7xl'
  | 'base'
  // Font weights.
  | 'thin'
  | 'extralight'
  | 'light'
  | 'normal'
  | 'medium'
  | 'semibold'
  | 'bold'
  | 'extrabold'
  | 'black'
  // Line heights (adds to 'normal' above).
  | 'tight'
  | 'snug'
  | 'relaxed'
  | 'loose'
  // Reserved keywords that appear as leaf keys.
  | 'none'
  | 'full'
  | 'auto'
  // Font families.
  | 'mono'
  | 'sans'
  | 'serif'
  // Font sub-namespaces (under `token.font`).
  | 'size'
  | 'weight'
  | 'family'
  | 'lineHeight'
  // Semantic color namespaces (shadcn palette).
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'background'
  | 'foreground'
  | 'muted'
  | 'surface'
  | 'destructive'
  | 'danger'
  | 'success'
  | 'warning'
  | 'info'
  | 'border'
  | 'ring'
  | 'input'
  | 'card'
  | 'popover'
  | 'gray'
  | 'primary-foreground'
  | 'secondary-foreground'
  | 'accent-foreground'
  | 'destructive-foreground'
  | 'muted-foreground'
  | 'card-foreground'
  | 'popover-foreground'
  // Raw Tailwind palette names.
  | 'slate'
  | 'zinc'
  | 'neutral'
  | 'stone'
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'emerald'
  | 'teal'
  | 'cyan'
  | 'sky'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'fuchsia'
  | 'pink'
  | 'rose';

/**
 * `TokenPath` is a string that can be further indexed by any framework-known
 * scale key. Every sub-access returns another `TokenPath`, so chained dot
 * paths remain valid while the leaf stays assignable wherever a CSS value
 * (`string | number`) is expected.
 */
export type TokenPath = string & {
  readonly [K in TokenKey]: TokenPath;
};

/** Project augmentation point for the `color` namespace. */
export interface VertzThemeColors {}
/** Project augmentation point for the `spacing` namespace. */
export interface VertzThemeSpacing {}
/** Project augmentation point for the `font` namespace. */
export interface VertzThemeFonts {}
/** Project augmentation point for the `radius` namespace. */
export interface VertzThemeRadius {}
/** Project augmentation point for the `shadow` namespace. */
export interface VertzThemeShadow {}

type NamespaceShape<T> = [keyof T] extends [never] ? TokenPath : Readonly<T>;

export interface VertzThemeTokens {
  readonly color: NamespaceShape<VertzThemeColors>;
  readonly spacing: NamespaceShape<VertzThemeSpacing>;
  readonly font: NamespaceShape<VertzThemeFonts>;
  readonly radius: NamespaceShape<VertzThemeRadius>;
  readonly shadow: NamespaceShape<VertzThemeShadow>;
}

interface TokenProxyTarget {
  readonly __prefix: string;
}

export function isToken(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [TOKEN_BRAND]?: true })[TOKEN_BRAND] === true
  );
}

function makeProxy(prefix: string): TokenPath {
  const target: TokenProxyTarget = { __prefix: prefix };
  return new Proxy(target, {
    get(_target, prop) {
      if (prop === TOKEN_BRAND) return true;
      if (typeof prop === 'symbol') {
        if (prop === Symbol.toPrimitive) return () => `var(${prefix})`;
        return undefined;
      }
      if (prop === 'toString' || prop === 'valueOf') return () => `var(${prefix})`;
      return makeProxy(`${prefix}-${prop}`);
    },
    ownKeys() {
      return [];
    },
    getOwnPropertyDescriptor() {
      return undefined;
    },
  }) as unknown as TokenPath;
}

function makeRoot(): VertzThemeTokens {
  return new Proxy({} as VertzThemeTokens, {
    get(_target, prop) {
      if (typeof prop === 'symbol') return undefined;
      return makeProxy(`--${prop}`);
    },
  });
}

export const token: VertzThemeTokens = makeRoot();
