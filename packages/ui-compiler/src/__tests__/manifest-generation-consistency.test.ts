/**
 * Validates that a manifest auto-generated from the signal-api-registry
 * matches the hand-crafted packages/ui/reactivity.json.
 *
 * If this test fails, it means the registry and the manifest are out of sync.
 * Run `generateFrameworkManifest()` and write its output to reactivity.json.
 */

import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { REACTIVE_SOURCE_APIS, SIGNAL_API_REGISTRY } from '../signal-api-registry';
import type { ReactivityManifest } from '../types';

/**
 * Generate the framework manifest from SIGNAL_API_REGISTRY + REACTIVE_SOURCE_APIS.
 * This is the auto-generation path that should replace manual maintenance.
 */
function generateFrameworkManifest(): ReactivityManifest {
  const exports: ReactivityManifest['exports'] = {};

  // Signal APIs (query, form, createLoader)
  for (const [name, config] of Object.entries(SIGNAL_API_REGISTRY)) {
    exports[name] = {
      kind: 'function',
      reactivity: {
        type: 'signal-api',
        signalProperties: [...config.signalProperties].sort(),
        plainProperties: [...config.plainProperties].sort(),
        ...(config.fieldSignalProperties
          ? { fieldSignalProperties: [...config.fieldSignalProperties].sort() }
          : {}),
      },
    };
  }

  // Reactive source APIs (useContext)
  for (const name of REACTIVE_SOURCE_APIS) {
    exports[name] = {
      kind: 'function',
      reactivity: { type: 'reactive-source' },
    };
  }

  // signal() itself
  exports.signal = {
    kind: 'function',
    reactivity: { type: 'signal' },
  };

  // Sort exports alphabetically (matches JSON.stringify with sorted keys)
  const sortedExports: ReactivityManifest['exports'] = {};
  for (const key of Object.keys(exports).sort()) {
    sortedExports[key] = exports[key];
  }

  return {
    version: 1,
    filePath: '@vertz/ui',
    exports: sortedExports,
  };
}

/**
 * Normalize a manifest for comparison: sort all arrays and object keys
 * so the comparison is deterministic regardless of insertion order.
 */
function normalize(manifest: ReactivityManifest): string {
  return JSON.stringify(
    manifest,
    (_key, value) => {
      if (value instanceof Set) {
        return [...value].sort();
      }
      if (Array.isArray(value)) {
        return [...value].sort();
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(value).sort()) {
          sorted[k] = value[k];
        }
        return sorted;
      }
      return value;
    },
    2,
  );
}

describe('framework manifest consistency', () => {
  it('auto-generated manifest matches packages/ui/reactivity.json', () => {
    // Load the existing hand-crafted manifest
    const manifestPath = resolve(__dirname, '../../../..', 'packages/ui/reactivity.json');
    const existingManifest = require(manifestPath) as ReactivityManifest;

    // Generate from the registry
    const generated = generateFrameworkManifest();

    // Compare normalized versions
    const normalizedExisting = normalize(existingManifest);
    const normalizedGenerated = normalize(generated);

    expect(normalizedGenerated).toBe(normalizedExisting);
  });

  it('generateFrameworkManifest produces valid manifest', () => {
    const manifest = generateFrameworkManifest();

    expect(manifest.version).toBe(1);
    expect(manifest.filePath).toBe('@vertz/ui');

    // Must include the core APIs
    expect(manifest.exports.query).toBeDefined();
    expect(manifest.exports.form).toBeDefined();
    expect(manifest.exports.createLoader).toBeDefined();
    expect(manifest.exports.useContext).toBeDefined();
    expect(manifest.exports.signal).toBeDefined();

    // Verify shapes
    expect(manifest.exports.query.reactivity.type).toBe('signal-api');
    expect(manifest.exports.useContext.reactivity.type).toBe('reactive-source');
    expect(manifest.exports.signal.reactivity.type).toBe('signal');
  });

  it('query() signal properties match QueryResult interface', () => {
    const manifest = generateFrameworkManifest();
    const queryReactivity = manifest.exports.query.reactivity;

    expect(queryReactivity.type).toBe('signal-api');
    if (queryReactivity.type === 'signal-api') {
      // These must match QueryResult<T> interface signal-backed properties
      expect(queryReactivity.signalProperties).toEqual(
        expect.arrayContaining(['data', 'loading', 'error', 'revalidating']),
      );
      // These must match QueryResult<T> plain methods
      expect(queryReactivity.plainProperties).toEqual(
        expect.arrayContaining(['refetch', 'revalidate', 'dispose']),
      );
    }
  });

  it('form() includes fieldSignalProperties', () => {
    const manifest = generateFrameworkManifest();
    const formReactivity = manifest.exports.form.reactivity;

    expect(formReactivity.type).toBe('signal-api');
    if (formReactivity.type === 'signal-api') {
      expect(formReactivity.fieldSignalProperties).toBeDefined();
      expect(formReactivity.fieldSignalProperties).toEqual(
        expect.arrayContaining(['value', 'error', 'dirty', 'touched']),
      );
    }
  });
});

// Export for use as a build script
export { generateFrameworkManifest };
