/**
 * Generate a stable hash from a file path for CSS sidecar naming.
 * Uses djb2 to match the CSS extractor's class name hashing.
 */
export function filePathHash(filePath: string): string {
  let hash = 5381;
  for (let i = 0; i < filePath.length; i++) {
    hash = ((hash << 5) + hash + filePath.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}
