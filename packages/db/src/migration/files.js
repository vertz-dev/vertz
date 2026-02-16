import { parseMigrationName } from './runner';
/**
 * Format a migration filename with zero-padded number.
 */
export function formatMigrationFilename(num, description) {
  return `${String(num).padStart(4, '0')}_${description}.sql`;
}
/**
 * Determine the next migration number from existing filenames.
 */
export function nextMigrationNumber(existingFiles) {
  let max = 0;
  for (const file of existingFiles) {
    const parsed = parseMigrationName(file);
    if (parsed && parsed.timestamp > max) {
      max = parsed.timestamp;
    }
  }
  return max + 1;
}
//# sourceMappingURL=files.js.map
