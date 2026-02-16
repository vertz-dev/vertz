import type { AssetDescriptor } from './types';
/**
 * Render asset descriptors to HTML tags for script/stylesheet injection.
 *
 * - Scripts: `<script src="..." [async] [defer]></script>`
 * - Stylesheets: `<link rel="stylesheet" href="...">`
 */
export declare function renderAssetTags(assets: AssetDescriptor[]): string;
//# sourceMappingURL=asset-pipeline.d.ts.map
