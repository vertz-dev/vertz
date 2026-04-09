import { afterEach, describe, expect, it } from '@vertz/test';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { loadSpec } from '../loader';

const tmpDir = join(import.meta.dir, '__tmp_loader_test__');

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadSpec', () => {
  describe('JSON files', () => {
    it('loads JSON file from disk', async () => {
      mkdirSync(tmpDir, { recursive: true });
      const specPath = join(tmpDir, 'spec.json');
      writeFileSync(specPath, JSON.stringify({ openapi: '3.0.3', info: { title: 'Test' } }));

      const result = await loadSpec(specPath);
      expect(result.openapi).toBe('3.0.3');
      expect((result.info as Record<string, unknown>).title).toBe('Test');
    });

    it('throws clear error for invalid JSON', async () => {
      mkdirSync(tmpDir, { recursive: true });
      const specPath = join(tmpDir, 'bad.json');
      writeFileSync(specPath, '{ invalid json }');

      await expect(loadSpec(specPath)).rejects.toThrow('Failed to parse');
    });
  });

  describe('YAML files', () => {
    it('loads .yaml file from disk', async () => {
      mkdirSync(tmpDir, { recursive: true });
      const specPath = join(tmpDir, 'spec.yaml');
      writeFileSync(specPath, 'openapi: "3.0.3"\ninfo:\n  title: Test\n');

      const result = await loadSpec(specPath);
      expect(result.openapi).toBe('3.0.3');
    });

    it('loads .yml file from disk', async () => {
      mkdirSync(tmpDir, { recursive: true });
      const specPath = join(tmpDir, 'spec.yml');
      writeFileSync(specPath, 'openapi: "3.1.0"\ninfo:\n  title: YML Test\n');

      const result = await loadSpec(specPath);
      expect(result.openapi).toBe('3.1.0');
    });

    it('throws clear error for invalid YAML', async () => {
      mkdirSync(tmpDir, { recursive: true });
      const specPath = join(tmpDir, 'bad.yaml');
      writeFileSync(specPath, '  : :\n  invalid:\nyaml: [[[');

      await expect(loadSpec(specPath)).rejects.toThrow('Failed to parse');
    });
  });

  describe('auto-detection', () => {
    it('auto-detects JSON content (starts with {) even without extension', async () => {
      mkdirSync(tmpDir, { recursive: true });
      const specPath = join(tmpDir, 'spec');
      writeFileSync(specPath, JSON.stringify({ openapi: '3.0.3', info: { title: 'NoExt' } }));

      const result = await loadSpec(specPath);
      expect(result.openapi).toBe('3.0.3');
    });
  });

  describe('error handling', () => {
    it('throws clear error for file not found', async () => {
      await expect(loadSpec('/nonexistent/path/spec.json')).rejects.toThrow('not found');
    });
  });
});
