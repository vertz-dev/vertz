/**
 * DOM query utilities for testing Vertz UI components.
 *
 * Provides helpers to locate elements by text content or test IDs,
 * plus an async `waitFor` poller for assertions on async updates.
 */
/**
 * Find a descendant element whose text content matches `text`.
 * Throws if no match is found.
 */
export declare function findByText(container: Element, text: string): HTMLElement;
/**
 * Find a descendant element whose text content matches `text`.
 * Returns null if no match is found.
 */
export declare function queryByText(container: Element, text: string): HTMLElement | null;
/**
 * Find a descendant element with `data-testid="<id>"`.
 * Throws if no match is found.
 */
export declare function findByTestId(container: Element, id: string): HTMLElement;
/**
 * Find a descendant element with `data-testid="<id>"`.
 * Returns null if no match is found.
 */
export declare function queryByTestId(container: Element, id: string): HTMLElement | null;
/** Options for `waitFor`. */
export interface WaitForOptions {
  /** Maximum time in ms to wait before throwing (default 1000). */
  timeout?: number;
  /** Polling interval in ms (default 50). */
  interval?: number;
}
/**
 * Poll an assertion function until it passes or times out.
 *
 * Useful for waiting on async DOM updates driven by signals or loaders.
 */
export declare function waitFor(assertion: () => void, opts?: WaitForOptions): Promise<void>;
//# sourceMappingURL=queries.d.ts.map
