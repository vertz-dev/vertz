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
export function generateClassName(filePath, blockName) {
  const input = `${filePath}::${blockName}`;
  const hash = djb2Hash(input);
  return `_${hash}`;
}
/**
 * DJB2 hash function — fast, simple, deterministic.
 * Returns an 8-character hex string.
 */
function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + char
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  // Convert to unsigned 32-bit, then hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}
//# sourceMappingURL=class-generator.js.map
