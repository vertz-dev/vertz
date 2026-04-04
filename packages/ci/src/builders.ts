import type {
  AllCondition,
  AnyCondition,
  BranchCondition,
  ChangedCondition,
  CommandTask,
  Condition,
  Dep,
  EnvCondition,
  PipeConfig,
  TaskDef,
  TaskResult,
} from './types';

/** Wire format for callback deps sent to the Rust binary via NDJSON. */
interface CallbackDepWire {
  task: string;
  on: { type: 'callback'; id: number };
}

// ---------------------------------------------------------------------------
// Callback registry — functions in dep.on are replaced with IDs for the
// Rust binary, which evaluates them via the loader's NDJSON protocol.
// ---------------------------------------------------------------------------

const callbacks = new Map<number, (result: TaskResult) => boolean>();
let nextId = 0;

/**
 * Define a CI pipeline configuration.
 *
 * Intercepts function values in `deps[].on` fields and registers them in a
 * callback registry. The function is replaced with `{ type: 'callback', id }`
 * so the Rust binary can request evaluation via the NDJSON bridge.
 */
export function pipe(config: PipeConfig): PipeConfig {
  for (const taskDef of Object.values(config.tasks)) {
    if (taskDef.deps) {
      // Replace function callbacks with serializable wire descriptors.
      // The resulting array mixes Dep and CallbackDepWire — the Rust binary
      // deserializes both. We cast back to Dep[] to keep the public API type.
      taskDef.deps = taskDef.deps.map((dep): Dep => {
        if (typeof dep === 'object' && typeof dep.on === 'function') {
          const id = nextId++;
          callbacks.set(id, dep.on as (result: TaskResult) => boolean);
          const wire: CallbackDepWire = { task: dep.task, on: { type: 'callback', id } };
          // Intentional: wire format is not assignable to Dep at the type level,
          // but the Rust binary handles both shapes.
          return wire as never;
        }
        return dep;
      });
    }
  }
  return config;
}

/** Access the callback registry (used by the loader script). */
export function getCallbacks(): Map<number, (result: TaskResult) => boolean> {
  return callbacks;
}

// ---------------------------------------------------------------------------
// task() — shorthand for defining tasks
// ---------------------------------------------------------------------------

export function task(command: string): CommandTask;
export function task(config: TaskDef): TaskDef;
export function task(input: string | TaskDef): TaskDef {
  if (typeof input === 'string') {
    return { command: input };
  }
  return input;
}

// ---------------------------------------------------------------------------
// cond.* — condition builders
// ---------------------------------------------------------------------------

export const cond = {
  changed(...patterns: string[]): ChangedCondition {
    return { type: 'changed', patterns };
  },
  branch(...names: string[]): BranchCondition {
    return { type: 'branch', names };
  },
  env(name: string, value?: string): EnvCondition {
    return value !== undefined ? { type: 'env', name, value } : { type: 'env', name };
  },
  all(...conditions: Condition[]): AllCondition {
    return { type: 'all', conditions };
  },
  any(...conditions: Condition[]): AnyCondition {
    return { type: 'any', conditions };
  },
};
