import { createHash } from 'node:crypto';
/**
 * Returns a SHA-256 hex hash of the given content string.
 * Used for comparing generated file content against what is already on disk.
 */
export function hashContent(content) {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}
//# sourceMappingURL=hasher.js.map
