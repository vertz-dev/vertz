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
export function createTemplateChunk(slotId: number, resolvedHtml: string, nonce?: string): string {
  const tmplId = `v-tmpl-${slotId}`;
  const slotRef = `v-slot-${slotId}`;

  const nonceAttr = nonce != null ? ` nonce="${escapeNonce(nonce)}"` : '';

  return (
    `<template id="${tmplId}">${resolvedHtml}</template>` +
    `<script${nonceAttr}>` +
    `(function(){` +
    `var s=document.getElementById("${slotRef}");` +
    `var t=document.getElementById("${tmplId}");` +
    `if(s&&t){s.replaceWith(t.content.cloneNode(true));t.remove()}` +
    `})()` +
    '</script>'
  );
}

/**
 * Escape a nonce value for safe embedding in an HTML attribute.
 * Prevents attribute breakout via double-quote injection.
 */
function escapeNonce(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
