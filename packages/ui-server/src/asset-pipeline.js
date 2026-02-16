import { escapeAttr } from './html-serializer';
/**
 * Render asset descriptors to HTML tags for script/stylesheet injection.
 *
 * - Scripts: `<script src="..." [async] [defer]></script>`
 * - Stylesheets: `<link rel="stylesheet" href="...">`
 */
export function renderAssetTags(assets) {
  if (assets.length === 0) return '';
  return assets
    .map((asset) => {
      if (asset.type === 'stylesheet') {
        return `<link rel="stylesheet" href="${escapeAttr(asset.src)}">`;
      }
      // Script
      const parts = [`<script src="${escapeAttr(asset.src)}"`];
      if (asset.async) parts.push(' async');
      if (asset.defer) parts.push(' defer');
      parts.push('></script>');
      return parts.join('');
    })
    .join('\n');
}
//# sourceMappingURL=asset-pipeline.js.map
