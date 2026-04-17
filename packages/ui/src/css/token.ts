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
 * Three augmentation points (one per namespace) let projects narrow the
 * vanilla `TokenPath` fallback to their concrete theme shape:
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
 * Without augmentation, each namespace is `TokenPath` (arbitrary dot paths
 * permitted, assignable into CSS-value positions). After augmentation,
 * unknown keys fail typecheck. Conditional `keyof … extends never` gates
 * the switch so empty augmentation interfaces don't break the fallback.
 */

export const TOKEN_BRAND: unique symbol = Symbol.for('vertz.ui.token') as never;

/**
 * `TokenPath` is a string that can be further indexed. Every index access
 * returns another `TokenPath`, so arbitrary dot-paths remain valid while the
 * leaf stays assignable wherever a CSS value (`string | number`) is expected.
 */
export type TokenPath = string & {
  readonly [key: string]: TokenPath;
  readonly [key: number]: TokenPath;
};

/** Project augmentation point for the `color` namespace. */
export interface VertzThemeColors {}
/** Project augmentation point for the `spacing` namespace. */
export interface VertzThemeSpacing {}
/** Project augmentation point for the `font` namespace. */
export interface VertzThemeFonts {}

type NamespaceShape<T> = [keyof T] extends [never] ? TokenPath : Readonly<T>;

export interface VertzThemeTokens {
  readonly color: NamespaceShape<VertzThemeColors>;
  readonly spacing: NamespaceShape<VertzThemeSpacing>;
  readonly font: NamespaceShape<VertzThemeFonts>;
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
