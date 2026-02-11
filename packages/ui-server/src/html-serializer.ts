import type { RawHtml, VNode } from './types';

/** HTML void elements that must not have a closing tag. */
export const VOID_ELEMENTS: Set<string> = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/** Elements whose text content should not be HTML-escaped. */
export const RAW_TEXT_ELEMENTS: Set<string> = new Set(['script', 'style']);

/** Escape special HTML characters in text content. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape special HTML characters in attribute values. */
export function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** Serialize attributes to an HTML string fragment. */
function serializeAttrs(attrs: Record<string, string>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    parts.push(` ${key}="${escapeAttr(value)}"`);
  }
  return parts.join('');
}

/** Check if a value is a RawHtml object. */
export function isRawHtml(value: VNode | string | RawHtml): value is RawHtml {
  return typeof value === 'object' && '__raw' in value && value.__raw === true;
}

/**
 * Serialize a VNode tree (or plain string) to an HTML string.
 *
 * This is the core serialization function for SSR. It walks the virtual tree
 * recursively and produces an HTML string without requiring a real DOM.
 *
 * - Text content inside `<script>` and `<style>` tags is not escaped.
 * - `RawHtml` values bypass escaping entirely.
 */
export function serializeToHtml(node: VNode | string | RawHtml): string {
  if (typeof node === 'string') {
    return escapeHtml(node);
  }

  if (isRawHtml(node)) {
    return node.html;
  }

  const { tag, attrs, children } = node;
  const attrStr = serializeAttrs(attrs);

  if (VOID_ELEMENTS.has(tag)) {
    return `<${tag}${attrStr}>`;
  }

  const isRawText = RAW_TEXT_ELEMENTS.has(tag);
  const childrenHtml = children
    .map((child) => {
      if (typeof child === 'string' && isRawText) {
        return child; // No escaping for script/style text content
      }
      return serializeToHtml(child);
    })
    .join('');

  return `<${tag}${attrStr}>${childrenHtml}</${tag}>`;
}
