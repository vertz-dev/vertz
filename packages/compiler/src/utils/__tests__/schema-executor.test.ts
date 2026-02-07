import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createSchemaExecutor } from '../schema-executor';

let tmpDir: string;

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vertz-test-'));
}

function teardown() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function writeFile(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

afterEach(() => {
  if (tmpDir) teardown();
});

describe('createSchemaExecutor', () => {
  it('execute returns JSON Schema for a valid schema file', async () => {
    setup();
    const filePath = writeFile(
      'user.js',
      `export const testSchema = { toJSONSchema() { return { type: 'object', properties: { name: { type: 'string' } } }; } };`,
    );
    const executor = createSchemaExecutor(tmpDir);
    const result = await executor.execute('testSchema', filePath);
    expect(result).not.toBeNull();
    expect(result!.jsonSchema).toHaveProperty('type', 'object');
  });

  it('execute returns null when file does not exist', async () => {
    setup();
    const executor = createSchemaExecutor(tmpDir);
    const result = await executor.execute('testSchema', path.join(tmpDir, 'nonexistent.js'));
    expect(result).toBeNull();
    expect(executor.getDiagnostics()).toHaveLength(1);
    expect(executor.getDiagnostics()[0]!.code).toBe('VERTZ_SCHEMA_EXECUTION');
  });

  it('execute returns null when export does not exist', async () => {
    setup();
    const filePath = writeFile(
      'user.js',
      `export const otherName = { toJSONSchema() { return {}; } };`,
    );
    const executor = createSchemaExecutor(tmpDir);
    const result = await executor.execute('testSchema', filePath);
    expect(result).toBeNull();
    expect(executor.getDiagnostics()).toHaveLength(1);
  });

  it('execute returns null when export has no toJSONSchema', async () => {
    setup();
    const filePath = writeFile(
      'user.js',
      `export const testSchema = { name: 'not a schema' };`,
    );
    const executor = createSchemaExecutor(tmpDir);
    const result = await executor.execute('testSchema', filePath);
    expect(result).toBeNull();
    expect(executor.getDiagnostics()).toHaveLength(1);
  });

  it('execute handles schema with .id()', async () => {
    setup();
    const filePath = writeFile(
      'user.js',
      `export const testSchema = { toJSONSchema() { return { type: 'object', $defs: { Named: {} } }; } };`,
    );
    const executor = createSchemaExecutor(tmpDir);
    const result = await executor.execute('testSchema', filePath);
    expect(result).not.toBeNull();
    expect(result!.jsonSchema).toHaveProperty('$defs');
  });

  it('getDiagnostics returns all accumulated errors', async () => {
    setup();
    const executor = createSchemaExecutor(tmpDir);
    await executor.execute('a', path.join(tmpDir, 'missing1.js'));
    await executor.execute('b', path.join(tmpDir, 'missing2.js'));
    expect(executor.getDiagnostics()).toHaveLength(2);
  });
});
