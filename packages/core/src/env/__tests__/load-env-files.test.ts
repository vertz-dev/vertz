import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFiles } from '../load-env-files';

describe('loadEnvFiles', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vertz-env-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Given a single .env file with KEY=VALUE pairs', () => {
    describe('When calling loadEnvFiles([path])', () => {
      it('Then returns parsed key-value pairs from the file', () => {
        const envFile = join(tempDir, '.env');
        writeFileSync(envFile, 'FOO=bar\nBAZ=qux');

        expect(loadEnvFiles([envFile])).toEqual({ FOO: 'bar', BAZ: 'qux' });
      });
    });
  });

  describe('Given multiple files where a later file overrides a key', () => {
    describe('When calling loadEnvFiles([file1, file2])', () => {
      it('Then the value from the later file wins', () => {
        const env = join(tempDir, '.env');
        const envLocal = join(tempDir, '.env.local');
        writeFileSync(env, 'PORT=3000\nHOST=localhost');
        writeFileSync(envLocal, 'PORT=5000');

        const result = loadEnvFiles([env, envLocal]);
        expect(result.PORT).toBe('5000');
        expect(result.HOST).toBe('localhost');
      });
    });
  });

  describe('Given a file path that does not exist', () => {
    describe('When calling loadEnvFiles([missingPath])', () => {
      it('Then skips the missing file without throwing', () => {
        const missing = join(tempDir, '.env.local');
        expect(() => loadEnvFiles([missing])).not.toThrow();
        expect(loadEnvFiles([missing])).toEqual({});
      });
    });
  });

  describe('Given a mix of existing and missing files', () => {
    describe('When calling loadEnvFiles([existing, missing, existing2])', () => {
      it('Then loads existing files and skips missing ones', () => {
        const env = join(tempDir, '.env');
        const missing = join(tempDir, '.env.missing');
        const envProd = join(tempDir, '.env.production');
        writeFileSync(env, 'FOO=from-env');
        writeFileSync(envProd, 'BAR=from-prod');

        const result = loadEnvFiles([env, missing, envProd]);
        expect(result).toEqual({ FOO: 'from-env', BAR: 'from-prod' });
      });
    });
  });

  describe('Given an empty file paths array', () => {
    describe('When calling loadEnvFiles([])', () => {
      it('Then returns an empty object', () => {
        expect(loadEnvFiles([])).toEqual({});
      });
    });
  });

  describe('Given a path that is a directory (not a file)', () => {
    describe('When calling loadEnvFiles([dirPath])', () => {
      it('Then throws instead of silently skipping', () => {
        expect(() => loadEnvFiles([tempDir])).toThrow();
      });
    });
  });
});
