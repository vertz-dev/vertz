/**
 * Deterministic, hash-based class name generation.
 *
 * Produces CSS Modules-style names: `_<hash>` based on file path + block name
 * + style content. The hash is stable across builds for the same input.
 */

/**
 * Generate a deterministic class name from a file path, block name, and style content.
 *
 * @param filePath - Source file path (used as part of the hash input).
 * @param blockName - The named block within css() (e.g. 'card', 'title').
 * @param styleFingerprint - Serialized style entries for disambiguation.
 *   At compile time this is empty (file paths are unique enough).
 *   At runtime this prevents collisions when multiple css() calls share
 *   the same default file path ('__runtime__') and block name.
 * @returns A scoped class name like `_a1b2c3d4`.
 */
export function generateClassName(
  filePath: string,
  blockName: string,
  styleFingerprint = '',
): string {
  const input = styleFingerprint
    ? `${filePath}::${blockName}::${styleFingerprint}`
    : `${filePath}::${blockName}`;
  const hash = djb2Hash(input);
  return `_${hash}`;
}

/**
 * DJB2 hash function — fast, simple, deterministic.
 * Returns an 8-character hex string.
 */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + char
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  // Convert to unsigned 32-bit, then hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}
