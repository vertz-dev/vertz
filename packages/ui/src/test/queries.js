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
export function findByText(container, text) {
  const el = queryByText(container, text);
  if (!el) {
    throw new TypeError(`findByText: no element found with text "${text}"`);
  }
  return el;
}
/**
 * Find a descendant element whose text content matches `text`.
 * Returns null if no match is found.
 */
export function queryByText(container, text) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode;
  while (node) {
    // Check direct text content — only consider text owned by this element,
    // not deeply nested children, to avoid matching parent wrappers.
    if (hasDirectTextMatch(node, text)) {
      return node;
    }
    const next = walker.nextNode();
    if (!next) break;
    node = next;
  }
  // Fallback: match against full textContent (for elements whose text
  // is spread across multiple child text nodes).
  return queryByTextContent(container, text);
}
/**
 * Check whether an element's own (non-child-element) text matches.
 */
function hasDirectTextMatch(el, text) {
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim() === text) {
      return true;
    }
  }
  return false;
}
/**
 * Fallback: walk elements checking full textContent.
 * Returns the deepest matching element (most specific).
 */
function queryByTextContent(container, text) {
  let best = null;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode;
  while (node) {
    if (node.textContent?.trim() === text) {
      best = node; // keep going — deeper matches are more specific
    }
    const next = walker.nextNode();
    if (!next) break;
    node = next;
  }
  return best;
}
/**
 * Find a descendant element with `data-testid="<id>"`.
 * Throws if no match is found.
 */
export function findByTestId(container, id) {
  const el = queryByTestId(container, id);
  if (!el) {
    throw new TypeError(`findByTestId: no element found with data-testid="${id}"`);
  }
  return el;
}
/**
 * Find a descendant element with `data-testid="<id>"`.
 * Returns null if no match is found.
 */
export function queryByTestId(container, id) {
  return container.querySelector(`[data-testid="${id}"]`);
}
/**
 * Poll an assertion function until it passes or times out.
 *
 * Useful for waiting on async DOM updates driven by signals or loaders.
 */
export async function waitFor(assertion, opts) {
  const timeout = opts?.timeout ?? 1000;
  const interval = opts?.interval ?? 50;
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (err) {
      lastError = err;
    }
    await sleep(interval);
  }
  // One final attempt so we throw the real assertion error.
  try {
    assertion();
  } catch {
    throw lastError instanceof Error
      ? lastError
      : new TypeError(`waitFor timed out after ${timeout}ms`);
  }
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=queries.js.map
