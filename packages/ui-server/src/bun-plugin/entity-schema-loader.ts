/**
 * Loads the entity schema manifest (entity-schema.json) from disk.
 *
 * The manifest is produced by codegen and describes entity metadata
 * (fields, relations, hidden fields, primary keys). When loaded into
 * the bun plugin, it enables relation-aware field selection injection.
 */

import { existsSync, readFileSync } from 'node:fs';
import type { EntitySchemaManifest } from './field-selection-inject';

/**
 * Load entity-schema.json from the given path.
 * Returns undefined if the file doesn't exist or can't be parsed.
 */
export function loadEntitySchema(schemaPath: string | undefined): EntitySchemaManifest | undefined {
  if (!schemaPath) return undefined;

  try {
    if (!existsSync(schemaPath)) return undefined;
    const content = readFileSync(schemaPath, 'utf-8');
    return JSON.parse(content) as EntitySchemaManifest;
  } catch {
    return undefined;
  }
}
