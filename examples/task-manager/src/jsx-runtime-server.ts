/**
 * Server-side JSX runtime for SSR.
 *
 * Produces VNode trees compatible with @vertz/ui-server's renderToStream.
 * Used only during SSR; the client uses the DOM-based jsx-runtime.ts.
 */

import type { VNode } from '@vertz/ui-server';

// biome-ignore lint/suspicious/noExplicitAny: JSX runtime needs flexible prop types
type Tag = string | ((props: any) => any);

// biome-ignore lint/suspicious/noExplicitAny: JSX runtime needs flexible children types
function normalizeChildren(children: any): (VNode | string)[] {
  if (children == null || children === false || children === true) return [];
  if (Array.isArray(children)) {
    return children.flatMap(normalizeChildren);
  }
  if (typeof children === 'object' && 'tag' in children) {
    return [children as VNode];
  }
  return [String(children)];
}

// biome-ignore lint/suspicious/noExplicitAny: JSX runtime needs flexible prop types
export function jsx(tag: Tag, props: Record<string, any>): VNode {
  // Component call — pass props through to the function
  if (typeof tag === 'function') {
    return tag(props);
  }

  const { children, ...attrs } = props || {};

  // Filter out event handlers and other non-serializable props for SSR
  const serializableAttrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on') && typeof value === 'function') {
      // Skip event handlers in SSR
      continue;
    }
    if (key === 'class' && value != null) {
      serializableAttrs.class = String(value);
    } else if (value === true) {
      serializableAttrs[key] = '';
    } else if (value !== false && value != null) {
      serializableAttrs[key] = String(value);
    }
  }

  return {
    tag,
    attrs: serializableAttrs,
    children: normalizeChildren(children),
  };
}

export const jsxs = jsx;

// biome-ignore lint/suspicious/noExplicitAny: JSX runtime needs flexible children types
export function Fragment(props: { children?: any }): VNode {
  // Fragments are represented as a special 'fragment' tag that gets unwrapped
  return {
    tag: 'fragment',
    attrs: {},
    children: normalizeChildren(props?.children),
  };
}

export const jsxDEV = jsx;
