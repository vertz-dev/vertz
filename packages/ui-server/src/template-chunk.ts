/**
 * Create a replacement template chunk for out-of-order streaming.
 *
 * When a Suspense boundary resolves, this function generates the HTML
 * containing:
 * 1. A `<template id="v-tmpl-N">` with the resolved content
 * 2. A `<script>` that replaces the placeholder `<div id="v-slot-N">` with the template content
 */
export function createTemplateChunk(slotId: number, resolvedHtml: string): string {
  const tmplId = `v-tmpl-${slotId}`;
  const slotRef = `v-slot-${slotId}`;

  return (
    `<template id="${tmplId}">${resolvedHtml}</template>` +
    '<script>' +
    `(function(){` +
    `var s=document.getElementById("${slotRef}");` +
    `var t=document.getElementById("${tmplId}");` +
    `if(s&&t){s.replaceWith(t.content.cloneNode(true));t.remove()}` +
    `})()` +
    '</script>'
  );
}
