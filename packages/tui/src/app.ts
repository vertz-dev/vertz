import { effect } from '@vertz/ui';
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
  effectCleanup: (() => void) | null;
  testStdin: TestStdin | null;
  stdinReader: StdinReaderLike | null;
  stdinOptions?: NodeJS.ReadStream;
  /** Manual re-render trigger for component-managed state. */
  rerenderFn: (() => void) | null;
  /** Call-order indexed component state (like React hooks). */
  componentStates: Map<number, unknown>;
  /** Current state index, reset before each render. */
  stateIndex: number;
}

/**
 * Mount a TUI application.
 * The component function is called to produce the initial TuiNode tree.
 * An effect wraps the call so signal dependencies are tracked
 * and the UI re-renders when signals change.
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
    effectCleanup: null,
    testStdin: options.testStdin ?? null,
    stdinReader: null,
    stdinOptions: options.stdin,
    rerenderFn: null,
    componentStates: new Map(),
    stateIndex: 0,
  };

  currentApp = ctx;

  // Render function with re-entrancy guard.
  // When rerenderFn is called during a render (e.g. from a keyboard handler),
  // we defer via a dirty flag and re-render after the current pass completes.
  let rendering = false;
  let dirty = false;
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
        const tree = app();
        renderer.render(tree);

        // Update TestAdapter buffer for test inspection
        if (adapter instanceof TestAdapter) {
          adapter.buffer = renderer.getBuffer();
        }
      } while (dirty);
    } finally {
      rendering = false;
    }
  };

  ctx.rerenderFn = doRender;

  // Initial render with effect for reactivity
  ctx.effectCleanup = effect(doRender);

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

  // Dispose effect
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
