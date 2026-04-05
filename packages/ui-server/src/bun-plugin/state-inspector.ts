/**
 * Vertz State Inspector — browser-side state collection for MCP tool.
 *
 * Walks the Fast Refresh component registry and serializes signal values,
 * query states, and computed values into a structured JSON snapshot.
 * Injected alongside fast-refresh-runtime.ts in dev mode.
 *
 * Zero overhead when no inspection is requested — the script only does work
 * when it receives an "inspect-state" WebSocket message from the server.
 */

declare global {
  interface Window {
    __vertz_overlay?: { _ws?: WebSocket };
  }
}

// ── Types ─────────────────────────────────────────────────────────

interface SignalRef {
  peek(): unknown;
  value: unknown;
  _hmrKey?: string;
  _queryGroup?: string;
}

interface ComponentInstance {
  element: HTMLElement;
  args: unknown[];
  cleanups: unknown[];
  contextScope: unknown;
  signals: SignalRef[];
}

interface ComponentRecord {
  factory: (...args: unknown[]) => HTMLElement;
  instances: ComponentInstance[];
  hash?: string;
  dirty: boolean;
}

type Registry = Map<string, Map<string, ComponentRecord>>;

export interface QuerySnapshot {
  data: SerializedValue;
  loading: boolean;
  revalidating: boolean;
  error: SerializedValue;
  idle: boolean;
  key?: string;
}

export interface InstanceSnapshot {
  index: number;
  key?: string;
  signals: Record<string, SerializedValue>;
  queries: Record<string, QuerySnapshot>;
}

export interface ComponentSnapshot {
  name: string;
  moduleId: string;
  instanceCount: number;
  instances: InstanceSnapshot[];
}

export interface StateSnapshot {
  components: ComponentSnapshot[];
  totalInstances: number;
  connectedClients: number;
  timestamp: string;
  message?: string;
  truncated?: boolean;
}

type SerializedValue = string | number | boolean | null | object;

// ── Constants ─────────────────────────────────────────────────────

const REGISTRY_KEY = Symbol.for('vertz:fast-refresh:registry');
const MAX_RESPONSE_SIZE = 2 * 1024 * 1024; // 2 MB
const DEFAULT_MAX_DEPTH = 4;

// Known query signal property names in creation order.
const QUERY_SIGNAL_NAMES = ['data', 'loading', 'revalidating', 'error', 'idle'];

// ── safeSerialize ─────────────────────────────────────────────────

/**
 * Serialize any JavaScript value to a JSON-safe representation.
 * Handles functions, DOM nodes, circular references, Date, Map, Set,
 * Error, Promise, Symbol, WeakRef, ArrayBuffer, and depth limiting.
 */
export function safeSerialize(
  value: unknown,
  maxDepth: number = DEFAULT_MAX_DEPTH,
  seen: WeakSet<object> = new WeakSet(),
): SerializedValue {
  // Primitives
  if (value === null) return null;
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return '[NaN]';
    if (!Number.isFinite(value)) return value > 0 ? '[Infinity]' : '[-Infinity]';
    return value;
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint') return value.toString();

  // Symbol
  if (typeof value === 'symbol') {
    const desc = value.description;
    return desc ? `[Symbol: ${desc}]` : '[Symbol]';
  }

  // Function
  if (typeof value === 'function') {
    const name = value.name;
    return name && name !== 'anonymous' ? `[Function: ${name}]` : '[Function]';
  }

  // At this point, value is an object
  const obj = value as object;

  // Circular reference check
  if (seen.has(obj)) return '[Circular]';

  // Date
  if (obj instanceof Date) return obj.toISOString();

  // Error
  if (obj instanceof Error) {
    return { name: obj.name, message: obj.message };
  }

  // Promise
  if (obj instanceof Promise) return '[Promise]';

  // Map
  if (obj instanceof Map) return `[Map: ${obj.size} entries]`;

  // Set
  if (obj instanceof Set) return `[Set: ${obj.size} items]`;

  // WeakMap / WeakSet / WeakRef
  if (obj instanceof WeakMap) return '[WeakMap]';
  if (obj instanceof WeakSet) return '[WeakSet]';
  if (typeof WeakRef !== 'undefined' && obj instanceof WeakRef) return '[WeakRef]';

  // ArrayBuffer
  if (obj instanceof ArrayBuffer) return `[ArrayBuffer: ${obj.byteLength} bytes]`;

  // TypedArray (Uint8Array, Int32Array, etc.)
  if (ArrayBuffer.isView(obj) && 'byteLength' in obj) {
    return `[ArrayBuffer: ${(obj as { byteLength: number }).byteLength} bytes]`;
  }

  // DOM Node / Element
  if (typeof HTMLElement !== 'undefined' && obj instanceof HTMLElement) {
    return `[HTMLElement: ${obj.tagName}]`;
  }
  if (typeof Node !== 'undefined' && obj instanceof Node) {
    return `[Node: ${obj.nodeName}]`;
  }

  // Depth limit reached
  if (maxDepth <= 0) {
    if (Array.isArray(obj)) return `[Array: ${obj.length} items]`;
    return `[Object: ${Object.keys(obj).length} keys]`;
  }

  // Track for circular detection
  seen.add(obj);

  // Array
  if (Array.isArray(obj)) {
    const result = obj.map((item) => safeSerialize(item, maxDepth - 1, seen));
    seen.delete(obj);
    return result;
  }

  // Plain object
  const result: Record<string, SerializedValue> = {};
  for (const key of Object.keys(obj)) {
    result[key] = safeSerialize((obj as Record<string, unknown>)[key], maxDepth - 1, seen);
  }
  seen.delete(obj);
  return result;
}

// ── peekSafe ──────────────────────────────────────────────────────

/** Read a signal value without tracking, catching recomputation errors. */
function peekSafe(sig: SignalRef): unknown {
  try {
    return sig.peek();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `[Error: ${msg}]`;
  }
}

// ── collectStateSnapshot ──────────────────────────────────────────

/**
 * Walk the Fast Refresh registry and collect a state snapshot.
 * Optionally filter by component function name (case-sensitive).
 */
export function collectStateSnapshot(filter?: string): StateSnapshot {
  const registry = (globalThis as Record<symbol, Registry>)[REGISTRY_KEY];

  if (!registry || registry.size === 0) {
    return emptySnapshot(
      filter
        ? `${filter} is not in the component registry. Check the name spelling or ensure the file has been loaded.`
        : undefined,
    );
  }

  const components: ComponentSnapshot[] = [];
  let totalInstances = 0;
  let foundInRegistry = false;

  for (const [moduleId, moduleMap] of registry) {
    for (const [name, record] of moduleMap) {
      if (filter && name !== filter) continue;
      if (filter) foundInRegistry = true;

      const instances: InstanceSnapshot[] = [];

      for (let i = 0; i < record.instances.length; i++) {
        const inst = record.instances[i]!;
        if (!inst.element?.isConnected) continue;

        const signals: Record<string, SerializedValue> = {};
        const queries: Record<string, QuerySnapshot> = {};

        // Partition signals: query-group vs standalone
        const queryGroups = new Map<string, SignalRef[]>();
        const standaloneSignals: SignalRef[] = [];

        for (const sig of inst.signals) {
          const group = (sig as unknown as Record<string, unknown>)._queryGroup as
            | string
            | undefined;
          if (group) {
            if (!queryGroups.has(group)) queryGroups.set(group, []);
            queryGroups.get(group)!.push(sig);
          } else {
            standaloneSignals.push(sig);
          }
        }

        // Serialize standalone signals (keyed by _hmrKey or positional)
        let positionalIdx = 0;
        for (const sig of standaloneSignals) {
          const key = sig._hmrKey ?? `signal_${positionalIdx++}`;
          signals[key] = safeSerialize(peekSafe(sig));
        }

        // Serialize query groups
        for (const [groupKey, groupSignals] of queryGroups) {
          queries[groupKey] = buildQuerySnapshot(groupSignals, groupKey);
        }

        instances.push({ index: i, signals, queries });
        totalInstances++;
      }

      if (instances.length > 0) {
        components.push({ name, moduleId, instanceCount: instances.length, instances });
      } else if (filter && foundInRegistry) {
        // Component registered but no mounted instances
      }
    }
  }

  // Generate message for filtered queries with no results
  let message: string | undefined;
  if (filter && components.length === 0) {
    if (foundInRegistry) {
      // Find the moduleId for context
      let moduleId = '';
      for (const [mid, moduleMap] of registry) {
        if (moduleMap.has(filter)) {
          moduleId = mid;
          break;
        }
      }
      message = `${filter} is registered (in ${moduleId}) but has 0 mounted instances on the current page. Navigate to a page that renders it.`;
    } else {
      message = `${filter} is not in the component registry. Check the name spelling or ensure the file has been loaded.`;
    }
  }

  const snapshot: StateSnapshot = {
    components,
    totalInstances,
    connectedClients: 0, // Set by server, not client
    timestamp: new Date().toISOString(),
    ...(message ? { message } : {}),
  };

  // Size cap: if serialized JSON exceeds 2 MB, truncate
  const jsonStr = JSON.stringify(snapshot);
  if (jsonStr.length > MAX_RESPONSE_SIZE) {
    return truncateSnapshot(snapshot);
  }

  return snapshot;
}

// ── Helpers ───────────────────────────────────────────────────────

function emptySnapshot(message?: string): StateSnapshot {
  return {
    components: [],
    totalInstances: 0,
    connectedClients: 0,
    timestamp: new Date().toISOString(),
    ...(message ? { message } : {}),
  };
}

function buildQuerySnapshot(signals: SignalRef[], groupKey: string): QuerySnapshot {
  // Map signals to query fields by _hmrKey or positional order
  const named = new Map<string, unknown>();
  const unnamed: unknown[] = [];

  for (const sig of signals) {
    const val = peekSafe(sig);
    if (sig._hmrKey && QUERY_SIGNAL_NAMES.includes(sig._hmrKey)) {
      named.set(sig._hmrKey, val);
    } else {
      unnamed.push(val);
    }
  }

  // Build snapshot preferring named, falling back to positional
  return {
    data: safeSerialize(named.get('data') ?? unnamed[0] ?? null),
    loading: Boolean(named.get('loading') ?? unnamed[1] ?? false),
    revalidating: Boolean(named.get('revalidating') ?? unnamed[2] ?? false),
    error: safeSerialize(named.get('error') ?? unnamed[3] ?? null),
    idle: Boolean(named.get('idle') ?? unnamed[4] ?? false),
    key: groupKey,
  };
}

// ── WebSocket listener ────────────────────────────────────────────

/**
 * Handle incoming `inspect-state` WebSocket messages.
 * Collects a state snapshot and sends it back with the matching requestId.
 */
export function handleInspectMessage(event: MessageEvent, ws: WebSocket): void {
  if (typeof event.data !== 'string') return;

  try {
    const msg = JSON.parse(event.data);
    if (msg.type === 'inspect-state') {
      const snapshot = collectStateSnapshot(msg.filter ?? undefined);
      ws.send(
        JSON.stringify({
          type: 'state-snapshot',
          requestId: msg.requestId,
          snapshot,
        }),
      );
    }
  } catch {
    // Ignore parse errors — not all messages are for us
  }
}

/**
 * Set up the state inspector's WebSocket listener.
 *
 * Uses `addEventListener` instead of replacing `onmessage` to coexist with
 * the error overlay handler. Polls for `__vertz_overlay._ws` reference changes
 * so that reconnections (which create a new WebSocket instance) are re-hooked.
 *
 * NOTE: When multiple browser tabs are connected, the server broadcasts
 * inspect-state to all. The first response wins — other tabs' responses are
 * dropped. This is acceptable for v0.1.x; a future improvement could merge
 * responses from multiple tabs.
 */
export function setupStateInspector(): void {
  if (typeof window === 'undefined') return;

  let currentWs: WebSocket | null = null;
  const MAX_INIT_RETRIES = 10;
  let initRetries = 0;

  function hookWs(ws: WebSocket): void {
    if (ws === currentWs) return;
    currentWs = ws;
    ws.addEventListener('message', (event: MessageEvent) => {
      handleInspectMessage(event, ws);
    });
  }

  function poll(): void {
    const overlay = window.__vertz_overlay;
    if (!overlay) {
      if (initRetries++ < MAX_INIT_RETRIES) {
        setTimeout(poll, 500);
      }
      return;
    }

    // Successfully found overlay — now poll for ws changes (reconnections)
    const checkWs = (): void => {
      if (overlay._ws && overlay._ws !== currentWs) {
        hookWs(overlay._ws);
      }
    };
    checkWs();
    // Check every 2s for reconnected WebSocket — lightweight poll
    setInterval(checkWs, 2000);
  }

  poll();
}

// Initialize when DOM is ready (browser only)
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupStateInspector);
  } else {
    setupStateInspector();
  }
}

function truncateSnapshot(snapshot: StateSnapshot): StateSnapshot {
  // Best-effort truncation: keep first 3 instances per component.
  // This may not bring size below 2MB if individual instances are
  // very large or there are many component types. The `truncated`
  // flag signals the consumer to request a filtered snapshot.
  const truncated: StateSnapshot = {
    ...snapshot,
    truncated: true,
    components: snapshot.components.map((comp) => ({
      ...comp,
      instances: comp.instances.slice(0, 3),
      instanceCount: comp.instanceCount,
    })),
  };
  truncated.totalInstances = truncated.components.reduce((sum, c) => sum + c.instances.length, 0);
  return truncated;
}
