import { afterEach, describe, expect, it } from 'bun:test';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dir, '..', '..');
const SCHEMA_PATH = path.join(ROOT, 'src', 'api', 'schema.ts');

describe('Feature: Schema rename propagates type errors', () => {
  let originalSchema: string;

  afterEach(() => {
    // Always restore the original schema
    if (originalSchema) {
      writeFileSync(SCHEMA_PATH, originalSchema);
      // Re-run codegen to restore generated files
      execSync('bun run codegen', { cwd: ROOT, stdio: 'ignore' });
    }
  });

  describe('Given a notes schema with a "title" field', () => {
    describe('When renaming "title" to "heading" and running codegen + typecheck', () => {
      it('Then typecheck reports errors at every consumer of "title"', () => {
        // Save original
        originalSchema = readFileSync(SCHEMA_PATH, 'utf-8');

        // Rename title -> heading in schema
        const modified = originalSchema.replace('title: d.text(),', 'heading: d.text(),');
        writeFileSync(SCHEMA_PATH, modified);

        // Run codegen (regenerates typed SDK with "heading" instead of "title")
        execSync('bun run codegen', { cwd: ROOT, stdio: 'ignore' });

        // Run typecheck — should FAIL because consumers still reference "title"
        let typecheckOutput: string;
        try {
          execSync('tsc --noEmit 2>&1', { cwd: ROOT, encoding: 'utf-8' });
          // If typecheck succeeds, the types are too loose
          throw new Error('Expected typecheck to fail after schema rename, but it succeeded');
        } catch (err: unknown) {
          const error = err as { stdout?: string; stderr?: string; status?: number };
          typecheckOutput = (error.stdout || '') + (error.stderr || '');
        }

        // Verify type errors mention the old field name
        expect(typecheckOutput).toContain('title');

        // Verify the type-safety test file has errors (it references 'title')
        expect(typecheckOutput).toContain('type-safety.test-d.ts');
      }, 30_000);
    });
  });
});
