/**
 * Deterministic, hash-based class name generation.
 *
 * Produces CSS Modules-style names: `_<hash>` based on file path + block name.
 * The hash is stable across builds for the same input.
 */
/**
 * Generate a deterministic class name from a file path and block name.
 *
 * @param filePath - Source file path (used as part of the hash input).
 * @param blockName - The named block within css() (e.g. 'card', 'title').
 * @returns A scoped class name like `_a1b2c3d4`.
 */
export declare function generateClassName(filePath: string, blockName: string): string;
//# sourceMappingURL=class-generator.d.ts.map
