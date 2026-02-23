import type { DisposeFn } from '@vertz/ui';
import { effect } from '@vertz/ui';
import { popScope, pushScope, runCleanups } from '@vertz/ui/internals';
import { StdinReader } from './input/stdin-reader';
import { setRenderCallback, setSyncRender } from './internals';
import type { TuiNode } from './nodes/types';
import {
  ALT_BUFFER_OFF,
  ALT_BUFFER_ON,
  CLEAR_SCREEN,
  CURSOR_HOME,
  HIDE_CURSOR,
  SHOW_CURSOR,
} from './renderer/ansi';
import { type OutputAdapter, StdoutAdapter } from './renderer/output-adapter';
import { TuiRenderer } from './renderer/renderer';
import { TestAdapter } from './test/test-adapter';
import type { TestStdin } from './test/test-stdin';

export interface TuiMountOptions {
  mode?: 'inline' | 'fullscreen' | 'alternate';
  stdout?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
  /** Test adapter for headless rendering. */
  adapter?: TestAdapter;
  /** Test stdin for key injection. */
  testStdin?: TestStdin;
}

export interface TuiHandle {
  unmount(): void;
  waitUntilExit(): Promise<void>;
  /** The output adapter (for testing). */
  output: OutputAdapter & { textAt?(row: number): string; text?(): string };
}

/** Global app context for the currently mounted app. */
let currentApp: AppContext | null = null;

/** Minimal interface for stdin reader — avoids importing the full module. */
interface StdinReaderLike {
  onKey(listener: (key: import('./input/key-parser').KeyEvent) => void): () => void;
  dispose(): void;
}

interface AppContext {
  renderer: TuiRenderer;
  adapter: OutputAdapter;
  mode: 'inline' | 'fullscreen' | 'alternate';
  disposed: boolean;
  exitResolve: (() => void) | null;
  testStdin: TestStdin | null;
  stdinReader: StdinReaderLike | null;
  stdinOptions?: NodeJS.ReadStream;
  /** Disposal scope for the component tree. */
  scope: DisposeFn[] | null;
  /** Legacy: effect cleanup for backward compat during transition. */
  effectCleanup: (() => void) | null;
  /** Legacy: manual re-render trigger (used by old-style components). */
  rerenderFn: (() => void) | null;
  /** Legacy: call-order indexed component state (like React hooks). */
  componentStates: Map<number, unknown>;
  /** Legacy: current state index, reset before each render. */
  stateIndex: number;
}

/**
 * Mount a TUI application.
 *
 * The component function is called ONCE to build the persistent tree.
 * Reactive updates happen through effects created by the internals
 * (__child, __attr, __conditional, __list), which call scheduleRender()
 * to trigger re-renders.
 *
 * For backward compatibility, old-style components (using useComponentState
 * and jsx()) are still supported via an effect wrapper.
 */
function mount(app: () => TuiNode, options: TuiMountOptions = {}): TuiHandle {
  const mode = options.mode ?? 'inline';

  // Create adapter
  let adapter: OutputAdapter;
  if (options.adapter) {
    adapter = options.adapter;
  } else {
    adapter = new StdoutAdapter(options.stdout);
  }

  const renderer = new TuiRenderer(adapter);

  // Setup mode
  if (mode === 'fullscreen') {
    adapter.write(HIDE_CURSOR + CLEAR_SCREEN + CURSOR_HOME);
  } else if (mode === 'alternate') {
    adapter.write(ALT_BUFFER_ON + HIDE_CURSOR);
  }

  let exitResolve: (() => void) | null = null;
  const exitPromise = new Promise<void>((resolve) => {
    exitResolve = resolve;
  });

  const ctx: AppContext = {
    renderer,
    adapter,
    mode,
    disposed: false,
    exitResolve,
    testStdin: options.testStdin ?? null,
    stdinReader: null,
    stdinOptions: options.stdin,
    scope: null,
    effectCleanup: null,
    rerenderFn: null,
    componentStates: new Map(),
    stateIndex: 0,
  };

  currentApp = ctx;

  // Enable synchronous rendering for test adapters
  const isTestMode = adapter instanceof TestAdapter;

  // Create StdinReader for real keyboard input
  if (!options.testStdin) {
    const stdinStream = options.stdin ?? (isTestMode ? undefined : process.stdin);
    if (stdinStream) {
      const reader = new StdinReader(stdinStream);
      reader.start();
      ctx.stdinReader = reader;
    }
  }
  setSyncRender(isTestMode);

  // Render function with re-entrancy guard.
  // Handles both old-style (snapshot) and new-style (persistent) trees.
  let rendering = false;
  let dirty = false;
  let lastTree: TuiNode = null;
  const doRender = () => {
    if (ctx.disposed) return;
    if (rendering) {
      dirty = true;
      return;
    }
    rendering = true;
    try {
      do {
        dirty = false;
        ctx.stateIndex = 0;
        lastTree = app();
        renderer.render(lastTree);
        if (adapter instanceof TestAdapter) {
          adapter.buffer = renderer.getBuffer();
        }
      } while (dirty);
    } finally {
      rendering = false;
    }
  };

  ctx.rerenderFn = doRender;

  // Build tree inside disposal scope and wrap in effect for reactivity.
  // The effect ensures old-style components (reading signals in jsx())
  // re-render when signals change. New-style components (using internals)
  // get re-renders via scheduleRender() instead.
  const scope = pushScope();
  ctx.effectCleanup = effect(doRender);
  popScope();
  ctx.scope = scope;

  // Set up render callback for new-style persistent tree re-renders.
  // scheduleRender() in internals calls this when element properties change.
  setRenderCallback(() => {
    if (ctx.disposed) return;
    if (lastTree) {
      renderer.render(lastTree);
      if (adapter instanceof TestAdapter) {
        adapter.buffer = renderer.getBuffer();
      }
    }
  });

  const handle: TuiHandle = {
    unmount() {
      cleanup(ctx);
    },
    async waitUntilExit() {
      await exitPromise;
    },
    output: adapter as TuiHandle['output'],
  };

  return handle;
}

function cleanup(ctx: AppContext): void {
  if (ctx.disposed) return;
  ctx.disposed = true;

  // Clear render callback
  setRenderCallback(null);

  // Dispose component scope (cleans up all effects, keyboard handlers, etc.)
  if (ctx.scope) {
    runCleanups(ctx.scope);
    ctx.scope = null;
  }

  // Legacy: dispose effect
  if (ctx.effectCleanup) {
    ctx.effectCleanup();
    ctx.effectCleanup = null;
  }

  // Stop stdin reader
  if (ctx.stdinReader) {
    ctx.stdinReader.dispose();
    ctx.stdinReader = null;
  }

  // Restore terminal state
  if (ctx.mode === 'fullscreen') {
    ctx.adapter.write(SHOW_CURSOR);
  } else if (ctx.mode === 'alternate') {
    ctx.adapter.write(ALT_BUFFER_OFF + SHOW_CURSOR);
  }

  // Resolve exit promise
  if (ctx.exitResolve) {
    ctx.exitResolve();
    ctx.exitResolve = null;
  }

  if (currentApp === ctx) {
    currentApp = null;
  }
}

/** Exit the current TUI app. */
function exit(): void {
  if (currentApp) {
    cleanup(currentApp);
  }
}

/** Get the current app context (internal). */
export function getCurrentApp(): AppContext | null {
  return currentApp;
}

/**
 * Get or create component state by call-order index.
 * Works like React's useState — state persists across re-renders
 * as long as components are called in the same order.
 *
 * @deprecated Use `signal()` with the compiler instead. This will be removed.
 */
export function useComponentState<T>(init: () => T): T {
  const app = currentApp;
  if (!app) return init();
  const idx = app.stateIndex++;
  if (!app.componentStates.has(idx)) {
    app.componentStates.set(idx, init());
  }
  return app.componentStates.get(idx) as T;
}

export const tui: { mount: typeof mount; exit: typeof exit } = {
  mount: mount,
  exit: exit,
};
