/**
 * @file Tests for reactivity manifest loading and integration.
 */
import { describe, expect, it } from 'bun:test';
import { loadFrameworkManifest, loadManifestFromJson } from '../reactivity-manifest';
import type { ReactivityManifest } from '../types';

describe('reactivity-manifest', () => {
  describe('loadManifestFromJson', () => {
    it('converts JSON arrays to Sets for signal-api exports', () => {
      const json: ReactivityManifest = {
        version: 1,
        filePath: '@vertz/ui',
        exports: {
          query: {
            kind: 'function',
            reactivity: {
              type: 'signal-api',
              signalProperties: ['data', 'loading', 'error'],
              plainProperties: ['refetch'],
            },
          },
        },
      };
      const loaded = loadManifestFromJson(json);
      const queryExport = loaded.exports.query;
      expect(queryExport.kind).toBe('function');
      expect(queryExport.reactivity.type).toBe('signal-api');
      if (queryExport.reactivity.type === 'signal-api') {
        expect(queryExport.reactivity.signalProperties).toBeInstanceOf(Set);
        expect(queryExport.reactivity.signalProperties).toEqual(
          new Set(['data', 'loading', 'error']),
        );
        expect(queryExport.reactivity.plainProperties).toBeInstanceOf(Set);
        expect(queryExport.reactivity.plainProperties).toEqual(new Set(['refetch']));
      }
    });

    it('converts fieldSignalProperties when present', () => {
      const json: ReactivityManifest = {
        version: 1,
        filePath: '@vertz/ui',
        exports: {
          form: {
            kind: 'function',
            reactivity: {
              type: 'signal-api',
              signalProperties: ['submitting'],
              plainProperties: ['action'],
              fieldSignalProperties: ['value', 'error'],
            },
          },
        },
      };
      const loaded = loadManifestFromJson(json);
      const formExport = loaded.exports.form;
      if (formExport.reactivity.type === 'signal-api') {
        expect(formExport.reactivity.fieldSignalProperties).toBeInstanceOf(Set);
        expect(formExport.reactivity.fieldSignalProperties).toEqual(new Set(['value', 'error']));
      }
    });

    it('passes through non-signal-api exports unchanged', () => {
      const json: ReactivityManifest = {
        version: 1,
        filePath: '@vertz/ui',
        exports: {
          useContext: {
            kind: 'function',
            reactivity: { type: 'reactive-source' },
          },
          signal: {
            kind: 'function',
            reactivity: { type: 'signal' },
          },
        },
      };
      const loaded = loadManifestFromJson(json);
      expect(loaded.exports.useContext.reactivity.type).toBe('reactive-source');
      expect(loaded.exports.signal.reactivity.type).toBe('signal');
    });

    it('warns and falls back to unknown for unsupported version', () => {
      const json = {
        version: 999,
        filePath: 'test',
        exports: {
          foo: { kind: 'function', reactivity: { type: 'static' } },
        },
      } as unknown as ReactivityManifest;
      const loaded = loadManifestFromJson(json);
      expect(loaded.exports.foo.reactivity.type).toBe('unknown');
    });
  });

  describe('loadFrameworkManifest', () => {
    it('loads the @vertz/ui framework manifest', () => {
      const manifest = loadFrameworkManifest();
      expect(manifest.version).toBe(1);
      expect(manifest.filePath).toBe('@vertz/ui');
    });

    it('includes query with correct signal properties', () => {
      const manifest = loadFrameworkManifest();
      const q = manifest.exports.query;
      expect(q.kind).toBe('function');
      expect(q.reactivity.type).toBe('signal-api');
      if (q.reactivity.type === 'signal-api') {
        expect(q.reactivity.signalProperties).toEqual(
          new Set(['data', 'loading', 'error', 'revalidating']),
        );
        expect(q.reactivity.plainProperties).toEqual(new Set(['refetch', 'revalidate', 'dispose']));
      }
    });

    it('includes form with fieldSignalProperties', () => {
      const manifest = loadFrameworkManifest();
      const f = manifest.exports.form;
      expect(f.kind).toBe('function');
      if (f.reactivity.type === 'signal-api') {
        expect(f.reactivity.fieldSignalProperties).toEqual(
          new Set(['value', 'error', 'dirty', 'touched']),
        );
      }
    });

    it('includes createLoader', () => {
      const manifest = loadFrameworkManifest();
      const cl = manifest.exports.createLoader;
      expect(cl.kind).toBe('function');
      expect(cl.reactivity.type).toBe('signal-api');
    });

    it('includes useContext as reactive-source', () => {
      const manifest = loadFrameworkManifest();
      expect(manifest.exports.useContext.reactivity.type).toBe('reactive-source');
    });

    it('includes signal', () => {
      const manifest = loadFrameworkManifest();
      expect(manifest.exports.signal.reactivity.type).toBe('signal');
    });
  });
});
