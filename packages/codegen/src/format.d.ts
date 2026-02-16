import type { GeneratedFile } from './types';
/**
 * Format generated files using Biome.
 *
 * Writes files to a temp directory with a standalone biome.json config,
 * runs `biome format --write --config-path <tempDir>`,
 * reads them back, and cleans up.
 */
export declare function formatWithBiome(files: GeneratedFile[]): Promise<GeneratedFile[]>;
//# sourceMappingURL=format.d.ts.map
