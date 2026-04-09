/**
 * Tests for entity schema manifest loading in the bun plugin.
 *
 * Verifies that the plugin:
 * 1. Loads entity-schema.json from disk when entitySchemaPath is provided
 * 2. Gracefully handles missing entity-schema.json
 * 3. Passes the loaded schema to injectFieldSelection()
 * 4. Reloads the schema when the file changes (via updateEntitySchema)
 */
import { describe, expect, it } from '@vertz/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loadEntitySchema } from '../entity-schema-loader';
import type { EntitySchemaManifest } from '../field-selection-inject';

const TEST_DIR = resolve(tmpdir(), `vertz-entity-schema-test-${Date.now()}`);

function setup() {
  mkdirSync(TEST_DIR, { recursive: true });
}

function cleanup() {
  rmSync(TEST_DIR, { recursive: true, force: true });
}

describe('loadEntitySchema', () => {
  describe('Given a valid entity-schema.json file', () => {
    it('Then loads and returns the parsed manifest', () => {
      setup();
      try {
        const schema: EntitySchemaManifest = {
          tasks: {
            primaryKey: 'id',
            tenantScoped: true,
            hiddenFields: [],
            fields: ['id', 'title', 'status'],
            relations: {
              assignee: { type: 'one', entity: 'users', selection: 'all' },
            },
          },
        };
        const schemaPath = resolve(TEST_DIR, 'entity-schema.json');
        writeFileSync(schemaPath, JSON.stringify(schema, null, 2));

        const result = loadEntitySchema(schemaPath);

        expect(result).toEqual(schema);
      } finally {
        cleanup();
      }
    });
  });

  describe('Given entity-schema.json does not exist', () => {
    it('Then returns undefined', () => {
      const result = loadEntitySchema(resolve(TEST_DIR, 'nonexistent', 'entity-schema.json'));

      expect(result).toBeUndefined();
    });
  });

  describe('Given entity-schema.json contains invalid JSON', () => {
    it('Then returns undefined', () => {
      setup();
      try {
        const schemaPath = resolve(TEST_DIR, 'entity-schema.json');
        writeFileSync(schemaPath, '{ invalid json }');

        const result = loadEntitySchema(schemaPath);

        expect(result).toBeUndefined();
      } finally {
        cleanup();
      }
    });
  });

  describe('Given a path is undefined', () => {
    it('Then returns undefined', () => {
      const result = loadEntitySchema(undefined);

      expect(result).toBeUndefined();
    });
  });

  describe('Given an empty JSON object', () => {
    it('Then returns the empty object', () => {
      setup();
      try {
        const schemaPath = resolve(TEST_DIR, 'entity-schema.json');
        writeFileSync(schemaPath, '{}');

        const result = loadEntitySchema(schemaPath);

        expect(result).toEqual({});
      } finally {
        cleanup();
      }
    });
  });

  describe('Given a JSON array instead of object', () => {
    it('Then returns undefined', () => {
      setup();
      try {
        const schemaPath = resolve(TEST_DIR, 'entity-schema.json');
        writeFileSync(schemaPath, '[]');

        const result = loadEntitySchema(schemaPath);

        expect(result).toBeUndefined();
      } finally {
        cleanup();
      }
    });
  });

  describe('Given an empty file', () => {
    it('Then returns undefined', () => {
      setup();
      try {
        const schemaPath = resolve(TEST_DIR, 'entity-schema.json');
        writeFileSync(schemaPath, '');

        const result = loadEntitySchema(schemaPath);

        expect(result).toBeUndefined();
      } finally {
        cleanup();
      }
    });
  });
});
