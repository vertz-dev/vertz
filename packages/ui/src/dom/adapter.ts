/**
 * Render adapter interface for pluggable rendering backends.
 *
 * The adapter is a factory that creates nodes. Tree manipulation
 * (appendChild, removeChild, insertBefore, replaceChild) stays
 * on the nodes themselves.
 */

import { createDOMAdapter } from './dom-adapter';

/**
 * Brand symbol for render nodes.
 * SSR nodes add this to their prototype for fast identification.
 * Browser DOM nodes use the `instanceof Node` fallback in `isRenderNode`.
 */
export const RENDER_NODE_BRAND: unique symbol = Symbol.for('vertz:render-node');

// biome-ignore lint/suspicious/noEmptyInterface: structural marker — extended by RenderElement and RenderText
export interface RenderNode {}

export interface RenderElement extends RenderNode {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  getAttribute(name: string): string | null;
  // biome-ignore lint/suspicious/noExplicitAny: must accept both CSSStyleDeclaration and SSR Proxy
  style: { display: string; [key: string]: any };
  classList: { add(cls: string): void; remove(cls: string): void };
  addEventListener(event: string, handler: EventListener): void;
  removeEventListener(event: string, handler: EventListener): void;
}

export interface RenderText extends RenderNode {
  data: string;
}

export interface RenderAdapter {
  createElement(tag: string): RenderElement;
  createTextNode(text: string): RenderText;
  createComment(text: string): RenderNode;
  createDocumentFragment(): RenderNode;
  isNode(value: unknown): value is RenderNode;
}

/**
 * Type guard: checks if a value is a RenderNode.
 * Fast path: brand check for SSR nodes.
 * Fallback: instanceof Node for browser DOM nodes.
 */
export function isRenderNode(value: unknown): value is RenderNode {
  if (value == null || typeof value !== 'object') return false;
  if (RENDER_NODE_BRAND in value) return true;
  return typeof Node !== 'undefined' && value instanceof Node;
}

// --- Module-level singleton ---

let currentAdapter: RenderAdapter | null = null;

/**
 * Get the current render adapter.
 * Auto-detects DOMAdapter if document exists and no adapter has been set.
 */
export function getAdapter(): RenderAdapter {
  if (!currentAdapter) {
    currentAdapter = createDOMAdapter();
  }
  return currentAdapter;
}

/**
 * Set the current render adapter.
 * Pass null to reset to auto-detect.
 */
export function setAdapter(adapter: RenderAdapter | null): void {
  currentAdapter = adapter;
}
