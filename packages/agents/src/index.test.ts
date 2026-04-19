import { describe, expect, it } from '@vertz/test';
import * as publicApi from './index';
import * as cloudflareSubpath from './cloudflare';
import type { D1Binding } from './index';

// ---------------------------------------------------------------------------
// Public entry re-export contract
// ---------------------------------------------------------------------------
//
// These tests pin which symbols are part of the public `@vertz/agents` entry
// so accidental removals (or `export *` drift) are caught in review.

function makeNoopBinding(): D1Binding {
  const stmt = {
    bind() {
      return stmt;
    },
    async all<T>() {
      return { results: [] as T[], success: true };
    },
    async run() {
      return { results: [], success: true };
    },
    async first<T>(): Promise<T | null> {
      return null;
    },
  };
  return {
    async exec() {
      return {};
    },
    prepare() {
      return stmt;
    },
    async batch() {
      return [];
    },
  };
}

describe('@vertz/agents public entry', () => {
  describe('Given the main index exports', () => {
    describe('When listing store factories', () => {
      it('Then exposes memoryStore, sqliteStore, and d1Store', () => {
        expect(typeof publicApi.memoryStore).toBe('function');
        expect(typeof publicApi.sqliteStore).toBe('function');
        expect(typeof publicApi.d1Store).toBe('function');
      });
    });
  });

  describe('Given d1Store is reachable from both the main entry and the cloudflare subpath', () => {
    describe('When comparing the two references', () => {
      it('Then they point at the exact same function (no duplicate implementation)', () => {
        expect(publicApi.d1Store).toBe(cloudflareSubpath.d1Store);
      });
    });
  });

  describe('Given the d1Store factory is invoked with a D1 binding', () => {
    describe('When building a store', () => {
      it('Then returns an AgentStore-shaped object', () => {
        const store = publicApi.d1Store({ binding: makeNoopBinding() });
        expect(typeof store.loadSession).toBe('function');
        expect(typeof store.saveSession).toBe('function');
        expect(typeof store.appendMessages).toBe('function');
        expect(typeof store.listSessions).toBe('function');
      });
    });
  });
});
