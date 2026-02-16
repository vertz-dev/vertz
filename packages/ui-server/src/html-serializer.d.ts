import type { RawHtml, VNode } from './types';
/** HTML void elements that must not have a closing tag. */
export declare const VOID_ELEMENTS: Set<string>;
/** Elements whose text content should not be HTML-escaped. */
export declare const RAW_TEXT_ELEMENTS: Set<string>;
/** Escape special HTML characters in text content. */
export declare function escapeHtml(text: string): string;
/** Escape special HTML characters in attribute values. */
export declare function escapeAttr(value: string): string;
/** Check if a value is a RawHtml object. */
export declare function isRawHtml(value: VNode | string | RawHtml): value is RawHtml;
/**
 * Serialize a VNode tree (or plain string) to an HTML string.
 *
 * This is the core serialization function for SSR. It walks the virtual tree
 * recursively and produces an HTML string without requiring a real DOM.
 *
 * - Text content inside `<script>` and `<style>` tags is not escaped.
 * - `RawHtml` values bypass escaping entirely.
 */
export declare function serializeToHtml(node: VNode | string | RawHtml): string;
//# sourceMappingURL=html-serializer.d.ts.map
