import type { UnwrapSignals } from '../runtime/signal-types';
import { getSSRContext } from '../ssr/ssr-render-context';
import { resolveChildren, type ChildValue } from './children';

export type { UnwrapSignals } from '../runtime/signal-types';

/**
 * A snapshot of context values at a point in time.
 * Each Provider creates a new scope that inherits from the parent.
 * Effects capture this scope so that useContext works in async callbacks.
 */
export type ContextScope = Map<Context<unknown>, unknown>;

/** The currently active context scope. */
let currentScope: ContextScope | null = null;

/**
 * Props for the JSX pattern of Context.Provider.
 *
 * `children` accepts both raw values (what TypeScript sees in JSX) and
 * thunks (what the compiler produces). At compile time the compiler wraps
 * JSX children in `() => ...`, but TypeScript checks the pre-compilation
 * source where children are plain elements.
 */
export interface ProviderJsxProps<T> {
  value: T;
  children: (() => unknown) | unknown;
}

/** A context object created by `createContext`. */
export interface Context<T> {
  /** Provide a value via callback pattern. */
  Provider(value: T, fn: () => void): void;
  /** Provide a value via JSX pattern (single-arg object with children thunk). */
  Provider(props: ProviderJsxProps<T>): HTMLElement;
  /** @internal — current value stack */
  _stack: T[];
  /** @internal — default value */
  _default: T | undefined;
}

/**
 * Duck-type detection for signal-like objects (has `.peek` function).
 * Used by Provider to auto-wrap signal properties in getters.
 */
export function isSignalLike(value: unknown): boolean {
  return (
    value != null &&
    typeof value === 'object' &&
    'peek' in value &&
    typeof (value as Record<string, unknown>).peek === 'function'
  );
}

/**
 * Wrap an object's signal-like properties in getters that read `.value`.
 * Non-signal properties are copied as-is. Primitives, null, undefined, and
 * arrays pass through unchanged.
 */
export function wrapSignalProps<T>(value: T): T {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const source = value as Record<string, unknown>;
  const keys = Object.keys(source);

  // Check if any property is signal-like; skip wrapping if none
  let hasSignal = false;
  for (const key of keys) {
    if (isSignalLike(source[key])) {
      hasSignal = true;
      break;
    }
  }
  if (!hasSignal) return value;

  const wrapped = {} as Record<string, unknown>;
  for (const key of keys) {
    const propValue = source[key];
    if (isSignalLike(propValue)) {
      Object.defineProperty(wrapped, key, {
        get() {
          return (propValue as { value: unknown }).value;
        },
        enumerable: true,
        configurable: true,
      });
    } else {
      wrapped[key] = propValue;
    }
  }

  return wrapped as T;
}

/**
 * Create lazy context value wrappers that re-read `props.value` on each
 * property access. This ensures computed/derived values in the Provider's
 * value prop are re-evaluated when accessed inside reactive effects.
 *
 * - Signal-like properties: captured once, `.value` read on access (reactive)
 * - Function properties: captured once (stable references)
 * - Other properties: re-read from `props.value` on each access (re-evaluates
 *   the JSX getter, picking up computed changes inside the effect's tracking)
 *
 * NOTE: Keys are snapshotted from the first read of `props.value`. The
 * compiler generates stable object literal shapes, so this is safe. If the
 * getter ever produced objects with varying keys, later-appearing properties
 * would be invisible to consumers.
 */
function wrapSignalPropsLazy<T>(propsObj: ProviderJsxProps<T>, initial: T): T {
  if (initial == null || typeof initial !== 'object' || Array.isArray(initial)) {
    return wrapSignalProps(initial);
  }

  const source = initial as Record<string, unknown>;
  const keys = Object.keys(source);
  const wrapped = {} as Record<string, unknown>;

  for (const key of keys) {
    const propValue = source[key];
    if (isSignalLike(propValue)) {
      // Signal: capture once, read .value on access (same as wrapSignalProps)
      Object.defineProperty(wrapped, key, {
        get() {
          return (propValue as { value: unknown }).value;
        },
        enumerable: true,
        configurable: true,
      });
    } else if (typeof propValue === 'function') {
      // Function: copy once (stable reference, never needs re-evaluation)
      wrapped[key] = propValue;
    } else {
      // Non-signal, non-function: re-read from the value getter on each access.
      // When accessed inside a reactive effect, the getter body re-evaluates
      // computed expressions (e.g., `doubled.value`), and the signal reads
      // inside the getter body subscribe the effect to those signals.
      Object.defineProperty(wrapped, key, {
        get() {
          return (propsObj.value as Record<string, unknown>)[key];
        },
        enumerable: true,
        configurable: true,
      });
    }
  }

  return wrapped as T;
}

/** Erase a typed Context<T> to the untyped key used by ContextScope maps. */
function asKey<T>(ctx: Context<T>): Context<unknown> {
  return ctx as Context<unknown>;
}

/**
 * Global context registry keyed by stable ID.
 * Lives on globalThis so it survives bundle re-evaluation during HMR.
 * When Bun re-evaluates a bundle, createContext() with the same ID returns
 * the existing object — preserving object identity for ContextScope Map keys.
 *
 * @internal — only used by the HMR system; invisible to end users.
 */
const REGISTRY_KEY = '__VERTZ_CTX_REG__';
const contextRegistry: Map<string, Context<unknown>> = ((globalThis as Record<string, unknown>)[
  REGISTRY_KEY
] as Map<string, Context<unknown>>) ??
(() => {
  const m = new Map<string, Context<unknown>>();
  (globalThis as Record<string, unknown>)[REGISTRY_KEY] = m;
  return m;
})();

/**
 * Create a context with an optional default value.
 * Returns an object with a `Provider` function.
 *
 * The optional `__stableId` parameter is injected by the compiler for HMR
 * support. When provided, the context object is cached in a global registry
 * so that bundle re-evaluation returns the same object — preserving identity
 * for ContextScope Map lookups. Users never pass this parameter directly.
 */
export function createContext<T>(defaultValue?: T, __stableId?: string): Context<T> {
  // HMR: return existing context if the same ID was already registered
  if (__stableId) {
    const existing = contextRegistry.get(__stableId);
    if (existing) return existing as Context<T>;
  }

  // The Provider implementation uses a single function with overload
  // disambiguation. TypeScript can't narrow return types across overloads
  // in a single implementation, so we type the object with explicit assertion.
  const ctx = {
    Provider(valueOrProps: T | ProviderJsxProps<T>, fn?: () => void): undefined | HTMLElement {
      // Disambiguate: 2 args = callback pattern, 1 arg = JSX pattern
      if (fn !== undefined) {
        // Callback pattern: Provider(value, fn)
        const value = wrapSignalProps(valueOrProps as T);
        const parentScope = getContextScope();
        const scope: ContextScope = parentScope ? new Map(parentScope) : new Map();
        scope.set(asKey(ctx), value);

        ctx._stack.push(value);
        const prevScope = setContextScope(scope);
        try {
          fn();
        } finally {
          ctx._stack.pop();
          setContextScope(prevScope);
        }
        return;
      }

      // JSX pattern: Provider({ value, children })
      const props = valueOrProps as ProviderJsxProps<T>;
      const rawValue = props.value;
      const { children } = props;

      // When the compiler generates JSX, it wraps non-literal attribute values
      // in getters: `get value() { return { count, doubled: doubled.value }; }`.
      // Detect this and use lazy wrapping so non-signal properties (computed
      // values, derived expressions) are re-evaluated on each access inside
      // consumer effects, maintaining reactive tracking through the getter chain.
      const valueDesc = Object.getOwnPropertyDescriptor(props, 'value');
      const value = valueDesc?.get
        ? wrapSignalPropsLazy(props, rawValue)
        : wrapSignalProps(rawValue);

      const parentScope = getContextScope();
      const scope: ContextScope = parentScope ? new Map(parentScope) : new Map();
      scope.set(asKey(ctx), value);

      ctx._stack.push(value);
      const prevScope = setContextScope(scope);
      try {
        // Children may be a thunk (compiler output) or a raw value
        // (JSX runtime / test code). Handle both.
        const result = typeof children === 'function' ? children() : children;
        // Multi-child components compile to a DocumentFragment-returning thunk,
        // so `result` is always a single Node. If a hand-written caller passes
        // an array (including nested arrays or thunks), flatten it into a
        // DocumentFragment so the Provider stays usable — the consumer expects
        // a single node, not an array. Fixes #2821.
        if (Array.isArray(result)) {
          const frag = document.createDocumentFragment();
          // resolveChildren already flattens nested arrays, invokes thunks, and
          // coerces primitives to text nodes. Booleans aren't in its contract,
          // so filter them here (React/JSX convention is to render nothing for
          // `true`/`false`).
          const filtered = (result as unknown[]).filter(
            (v) => typeof v !== 'boolean',
          ) as ChildValue[];
          for (const node of resolveChildren(filtered)) {
            frag.appendChild(node);
          }
          return frag as unknown as HTMLElement;
        }
        return result as HTMLElement;
      } finally {
        ctx._stack.pop();
        setContextScope(prevScope);
      }
    },
    _default: defaultValue,
    _stack: [],
  } as Context<T>;

  // Register for HMR stability
  if (__stableId) {
    contextRegistry.set(__stableId, ctx as Context<unknown>);
  }

  return ctx;
}

/**
 * Retrieve the current value from the nearest Provider.
 * Checks the synchronous call stack first, then falls back to
 * the captured context scope (for async callbacks like watch/effect).
 * Returns the default value if no Provider is active.
 */
export function useContext<T>(ctx: Context<T>): UnwrapSignals<T> | undefined {
  // Synchronous path: Provider is currently on the call stack
  if (ctx._stack.length > 0) {
    const value = ctx._stack[ctx._stack.length - 1] as UnwrapSignals<T>;

    // Augment the effect's captured scope so that on re-runs (when the
    // Provider is no longer on the call stack) the context is still found
    // via the scope path. This fixes the case where __listValue creates
    // its domEffect outside a Provider but the rendered output is placed
    // inside one — the first run succeeds via _stack, and re-runs succeed
    // via the augmented scope. See #2477.
    //
    // Safety: this mutates the ContextScope Map by reference. This is safe
    // because each Provider creates a fresh Map via `new Map(parentScope)`,
    // so child scopes are clones. The `!scope.has(key)` guard prevents
    // overwriting an existing value (e.g., from a nested Provider for the
    // same context). The augmented entry persists on the Map, which is the
    // desired behavior — the effect's `_contextScope` reference is the
    // same Map, so re-runs see the augmented value.
    const key = asKey(ctx);
    const scope = getContextScope();
    if (scope && !scope.has(key)) {
      scope.set(key, value);
    }

    return value;
  }
  // Async path: check the captured context scope
  const key = asKey(ctx);
  const scope = getContextScope();
  if (scope?.has(key)) {
    return scope.get(key) as UnwrapSignals<T>;
  }
  return ctx._default as UnwrapSignals<T> | undefined;
}

/**
 * Get the current context scope for capture by effects.
 * @internal
 */
export function getContextScope(): ContextScope | null {
  const ctx = getSSRContext();
  if (ctx) return ctx.contextScope;
  return currentScope;
}

/**
 * Set the current context scope (used by effects to restore captured context).
 * Returns the previous scope for restoration.
 * @internal
 */
export function setContextScope(scope: ContextScope | null): ContextScope | null {
  const ctx = getSSRContext();
  if (ctx) {
    const prev = ctx.contextScope;
    ctx.contextScope = scope;
    return prev;
  }
  const prev = currentScope;
  currentScope = scope;
  return prev;
}
