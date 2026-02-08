/**
 * Lifecycle primitives for @vertz/ui POC.
 *
 * Validates: watch() with dependency tracking, watch() for mount-only,
 * onCleanup semantics, onMount timing.
 */

import { effect } from './signal';

type CleanupFn = () => void;

let cleanupCollector: CleanupFn[] | null = null;

/**
 * Register a cleanup function within the current watch/effect scope.
 * Called before re-execution and on unmount.
 */
export function onCleanup(fn: CleanupFn): void {
  if (cleanupCollector !== null) {
    cleanupCollector.push(fn);
  }
}

/**
 * watch() — the only side-effect primitive.
 *
 * Two forms:
 *
 * 1. `watch(() => { ... })` — no dependency, runs once on mount.
 * 2. `watch(() => dep, (value) => { ... })` — runs on mount with current dep,
 *    then re-runs whenever dep changes.
 *
 * Both forms support onCleanup() inside the callback.
 * Returns a dispose function.
 */
export function watch<T>(
  depsOrCallback: (() => T) | (() => void),
  callback?: (value: T) => void,
): () => void {
  if (callback === undefined) {
    // Form 1: watch(() => { ... }) — run once on mount
    const fn = depsOrCallback as () => void;
    let cleanups: CleanupFn[] = [];

    const prevCollector = cleanupCollector;
    cleanupCollector = cleanups;
    try {
      fn();
    } finally {
      cleanupCollector = prevCollector;
    }

    return () => {
      for (const c of cleanups) {
        c();
      }
      cleanups = [];
    };
  }

  // Form 2: watch(() => dep, (value) => { ... })
  const depsFn = depsOrCallback as () => T;
  let cleanups: CleanupFn[] = [];

  const dispose = effect(() => {
    // Run cleanups from previous execution
    for (const c of cleanups) {
      c();
    }
    cleanups = [];

    // Track dependencies by calling depsFn inside the effect
    const value = depsFn();

    // Run callback with cleanup collection
    const prevCollector = cleanupCollector;
    cleanupCollector = cleanups;
    try {
      callback(value);
    } finally {
      cleanupCollector = prevCollector;
    }
  });

  return () => {
    for (const c of cleanups) {
      c();
    }
    cleanups = [];
    dispose();
  };
}

/**
 * onMount — run a function once after component setup.
 * Alias for watch with no dependencies.
 */
export function onMount(fn: () => undefined | CleanupFn): () => void {
  let mountCleanup: CleanupFn | undefined;

  const prevCollector = cleanupCollector;
  cleanupCollector = [];
  const collectedCleanups: CleanupFn[] = cleanupCollector;
  try {
    mountCleanup = fn();
  } finally {
    cleanupCollector = prevCollector;
  }

  return () => {
    if (mountCleanup) {
      mountCleanup();
    }
    for (const c of collectedCleanups) {
      c();
    }
  };
}
