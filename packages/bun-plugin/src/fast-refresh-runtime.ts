/**
 * Vertz Fast Refresh Runtime — browser-side component registry and DOM replacement.
 *
 * Three-function API consumed by compiler-injected code:
 * - __$refreshReg(moduleId, name, factory) — register/update a component factory
 * - __$refreshTrack(moduleId, name, element, cleanups, ctx) — track a live instance
 * - __$refreshPerform(moduleId) — re-mount all instances of components in a module
 *
 * This is the JS HMR equivalent of CSS sidecar HMR. Instead of hot-swapping
 * stylesheets, it unmounts old components, re-executes the factory, and
 * replaces the DOM node. Local state resets (MVP — signal preservation deferred).
 *
 * ARCHITECTURE: This module exposes its API via globalThis so that component
 * modules don't need to import it. This is critical because Bun's HMR system
 * propagates updates through the import graph — if component modules import
 * from @vertz/ui/internals (which this runtime needs), changes to the component
 * would cause Bun to try updating @vertz/ui/dist chunks, which don't self-accept,
 * triggering a full page reload. By using globalThis, component modules have
 * ZERO additional import dependencies for Fast Refresh.
 */

// Self-accept HMR updates to prevent Bun from propagating changes through
// @vertz/ui/dist chunks to the root HTML (which would trigger a full reload).
// This is safe because all runtime state lives on globalThis, not module scope.
import.meta.hot.accept();

// Import from @vertz/ui/internals to share the SAME module instance as the
// app code. This ensures currentScope / disposal stack variables are shared.
import {
  _tryOnCleanup,
  getContextScope,
  popScope,
  pushScope,
  runCleanups,
  setContextScope,
} from '@vertz/ui/internals';

/** Disposal cleanup function. */
type DisposeFn = () => void;

/** Derive ContextScope from the actual return type of getContextScope. */
type ContextScope = NonNullable<ReturnType<typeof getContextScope>>;

// ── Types ────────────────────────────────────────────────────────

interface ComponentInstance {
  /** The live DOM node returned by the component factory. */
  element: HTMLElement;
  /** Original arguments passed to the component factory (for re-mount). */
  args: unknown[];
  /** Disposal scope cleanups captured during component execution. */
  cleanups: DisposeFn[];
  /** Context scope snapshot for context replay on re-mount. */
  contextScope: ContextScope | null;
}

interface ComponentRecord {
  /** The latest wrapped component factory. */
  factory: (...args: unknown[]) => HTMLElement;
  /** All tracked live instances of this component. */
  instances: ComponentInstance[];
}

// moduleId → componentName → ComponentRecord
type Registry = Map<string, Map<string, ComponentRecord>>;

// ── Registry (globalThis singleton) ──────────────────────────────
//
// CRITICAL: The registry MUST live on globalThis so it survives HMR
// module re-evaluation. When Bun re-evaluates a module, all its imports
// are re-resolved. If the runtime module itself gets a fresh instance,
// the module-scoped Map would be empty — losing all tracked instances.
// By using globalThis, the registry persists across re-evaluations.
// Same pattern as the context registry in createContext().

const REGISTRY_KEY = Symbol.for('vertz:fast-refresh:registry');
const DIRTY_KEY = Symbol.for('vertz:fast-refresh:dirty');

const registry: Registry =
  (globalThis as Record<symbol, Registry>)[REGISTRY_KEY] ??=
    new Map();

/** Modules whose factories were updated in the current re-evaluation cycle. */
const dirtyModules: Set<string> =
  (globalThis as Record<symbol, Set<string>>)[DIRTY_KEY] ??=
    new Set();

/** Flag to suppress instance tracking during __$refreshPerform re-mount. */
let performingRefresh = false;

/**
 * Get or create the component map for a module.
 */
function getModule(moduleId: string): Map<string, ComponentRecord> {
  let mod = registry.get(moduleId);
  if (!mod) {
    mod = new Map();
    registry.set(moduleId, mod);
  }
  return mod;
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Register or update a component factory in the registry.
 *
 * Called at module top-level after each component definition.
 * On first load: creates a new record. On HMR re-evaluation: updates
 * the factory reference (instances are preserved for __$refreshPerform).
 */
export function __$refreshReg(
  moduleId: string,
  name: string,
  factory: (...args: unknown[]) => HTMLElement,
): void {
  const mod = getModule(moduleId);
  const existing = mod.get(name);
  if (existing) {
    // HMR re-evaluation — update factory, keep instances.
    existing.factory = factory;
    dirtyModules.add(moduleId);
  } else {
    // First load — create record (not dirty, nothing to re-mount)
    mod.set(name, { factory, instances: [] });
  }
}

/**
 * Track a live component instance for HMR replacement.
 *
 * Called by the wrapper injected around each component. Captures the DOM
 * element, disposal cleanups, and context scope. Returns the element
 * unchanged (transparent to callers).
 *
 * Prunes stale instances (elements no longer in the DOM) on each call
 * to prevent memory leaks from navigated-away pages.
 */
export function __$refreshTrack(
  moduleId: string,
  name: string,
  element: HTMLElement,
  args: unknown[],
  cleanups: DisposeFn[],
  contextScope: ContextScope | null,
): HTMLElement {
  // During __$refreshPerform, the factory wrapper calls __$refreshTrack.
  // Skip tracking here — __$refreshPerform manages instances itself.
  if (performingRefresh) return element;

  const mod = registry.get(moduleId);
  if (!mod) return element;

  const record = mod.get(name);
  if (!record) return element;

  // Prune instances whose elements are no longer in the DOM
  record.instances = record.instances.filter((inst) => inst.element.isConnected);

  // Track this instance
  record.instances.push({ element, args, cleanups, contextScope });

  return element;
}

/**
 * Perform hot replacement for all components in a module.
 *
 * Called from the HMR accept handler after module re-evaluation.
 * For each component with tracked instances:
 * 1. Skip instances whose elements are no longer in the DOM
 * 2. Run old cleanups (LIFO order via runCleanups)
 * 3. Create a new disposal scope + restore context
 * 4. Re-execute the factory to get a new DOM element
 * 5. Replace the old element in the DOM
 * 6. Update the instance record
 */
export function __$refreshPerform(moduleId: string): void {
  // Only re-mount if this module's factory was actually updated (dirty).
  if (!dirtyModules.has(moduleId)) return;
  dirtyModules.delete(moduleId);

  const mod = registry.get(moduleId);
  if (!mod) return;

  performingRefresh = true;

  for (const [name, record] of mod) {
    const { factory, instances } = record;
    const updatedInstances: ComponentInstance[] = [];

    for (const instance of instances) {
      const { element, args, cleanups, contextScope } = instance;
      const parent = element.parentNode;

      // Skip instances no longer in the DOM
      if (!parent) continue;

      // 1. Create new disposal scope and restore context BEFORE cleanups.
      const newCleanups = pushScope();
      const prevScope = setContextScope(contextScope);

      let newElement: HTMLElement;
      try {
        // 2. Re-execute factory with the original args (props replay)
        newElement = factory(...args);
      } catch (err) {
        // Factory failed — keep old instance intact.
        popScope();
        setContextScope(prevScope);
        console.error(`[vertz-hmr] Error re-mounting ${name}:`, err);
        updatedInstances.push(instance);
        continue;
      }

      popScope();

      // 3. Now that we have a successful new element, run old cleanups
      runCleanups(cleanups);

      // Forward inner cleanups to parent scope (like RouterView does)
      if (newCleanups.length > 0) {
        _tryOnCleanup(() => runCleanups(newCleanups));
      }

      setContextScope(prevScope);

      // 4. Replace DOM node
      parent.replaceChild(newElement, element);

      // 5. Track new instance
      updatedInstances.push({
        element: newElement,
        args,
        cleanups: newCleanups,
        contextScope,
      });
    }

    // Replace instances list (pruning dead ones)
    record.instances = updatedInstances;
  }

  performingRefresh = false;

  console.log(`[vertz-hmr] Hot updated: ${moduleId}`);
}

// ── globalThis registration ──────────────────────────────────────
//
// Expose all Fast Refresh functions on globalThis so component modules
// can access them WITHOUT importing this module.

const FR_KEY = Symbol.for('vertz:fast-refresh');

(globalThis as Record<symbol, unknown>)[FR_KEY] = {
  __$refreshReg,
  __$refreshTrack,
  __$refreshPerform,
  pushScope,
  popScope,
  _tryOnCleanup,
  runCleanups,
  getContextScope,
  setContextScope,
};
