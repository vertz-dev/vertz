/**
 * Runs callback once on mount. Never re-executes.
 * Supports `onCleanup` inside for teardown on unmount.
 */
export declare function onMount(callback: () => void): void;
/**
 * Watches a dependency accessor and runs callback whenever it changes.
 * Always takes TWO arguments: a dependency accessor and a callback.
 * Runs callback immediately with current value.
 * Before each re-run, any `onCleanup` from previous run executes first.
 */
export declare function watch<T>(dep: () => T, callback: (value: T) => void): void;
//# sourceMappingURL=lifecycle.d.ts.map
