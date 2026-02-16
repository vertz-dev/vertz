/**
 * Create a replacement template chunk for out-of-order streaming.
 *
 * When a Suspense boundary resolves, this function generates the HTML
 * containing:
 * 1. A `<template id="v-tmpl-N">` with the resolved content
 * 2. A `<script>` that replaces the placeholder `<div id="v-slot-N">` with the template content
 *
 * @param slotId - The unique slot ID for this suspense boundary.
 * @param resolvedHtml - The resolved HTML content to insert.
 * @param nonce - Optional CSP nonce to add to the inline script tag.
 */
export declare function createTemplateChunk(
  slotId: number,
  resolvedHtml: string,
  nonce?: string,
): string;
//# sourceMappingURL=template-chunk.d.ts.map
