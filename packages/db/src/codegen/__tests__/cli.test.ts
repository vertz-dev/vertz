import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * CLI integration tests (DB-CG-013 to DB-CG-015).
 *
 * Tests the CLI generate command behavior.
 *
 * Acceptance criteria:
 * - DB-CG-013: vertz generate command finds domain files
 * - DB-CG-014: Writes output to .vertz/generated/
 * - DB-CG-015: Skips generation if domains haven't changed (deterministic)
 */
describe('CLI Integration Tests (DB-CG-013 to DB-CG-015)', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `vertz-codegen-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, '.vertz', 'generated'), { recursive: true });
    mkdirSync(join(testDir, 'domains'), { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // DB-CG-013: vertz generate command finds domain files
  it('DB-CG-013: generate command discovers domain files', async () => {
    // Write a domain file
    const domainFile = join(testDir, 'domains', 'user.domain.ts');
    writeFileSync(domainFile, `
import { defineDomain } from '@vertz/db';

export const userDomain = defineDomain('user', {
  fields: {
    id: { type: 'uuid', primary: true },
    name: { type: 'string', required: true },
    email: { type: 'string', required: true },
  },
});
`);

    // Run generate command
    const result = await runGenerateCommand(testDir);

    // Should not error and should find domain files
    expect(result.success).toBe(true);
    expect(result.stdout).toContain('Found 1 domain file(s)');
  });

  // DB-CG-014: Writes output to .vertz/generated/
  it('DB-CG-014: generate command writes to .vertz/generated/', async () => {
    // Write a domain file
    const domainFile = join(testDir, 'domains', 'user.domain.ts');
    writeFileSync(domainFile, `
import { defineDomain } from '@vertz/db';

export const userDomain = defineDomain('user', {
  fields: {
    id: { type: 'uuid', primary: true },
    name: { type: 'string', required: true },
  },
});
`);

    // Run generate command
    await runGenerateCommand(testDir);

    // Check output file exists
    const outputFile = join(testDir, '.vertz', 'generated', 'db-client.ts');
    expect(existsSync(outputFile)).toBe(true);

    // Should contain generated code
    const content = readFileSync(outputFile, 'utf-8');
    expect(content).toContain('export const db');
    expect(content).toContain('interface User');
  });

  // DB-CG-015: Skips generation if domains haven't changed
  it('DB-CG-015: generate command skips generation when unchanged', async () => {
    // Write a domain file
    const domainFile = join(testDir, 'domains', 'user.domain.ts');
    writeFileSync(domainFile, `
import { defineDomain } from '@vertz/db';

export const userDomain = defineDomain('user', {
  fields: {
    id: { type: 'uuid', primary: true },
    name: { type: 'string', required: true },
  },
});
`);

    // First run - should generate
    const firstRun = await runGenerateCommand(testDir);
    expect(firstRun.success).toBe(true);

    const outputFile = join(testDir, '.vertz', 'generated', 'db-client.ts');
    const firstContent = readFileSync(outputFile, 'utf-8');
    const firstMtime = (await import('node:fs')).statSync(outputFile).mtimeMs;

    // Wait a bit to ensure timestamp would differ
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Second run - should skip (no changes)
    const secondRun = await runGenerateCommand(testDir);
    expect(secondRun.success).toBe(true);
    expect(secondRun.stdout).toContain('Skipping');

    // Content should be identical
    const secondContent = readFileSync(outputFile, 'utf-8');
    expect(firstContent).toBe(secondContent);

    // Modify domain file
    writeFileSync(domainFile, `
import { defineDomain } from '@vertz/db';

export const userDomain = defineDomain('user', {
  fields: {
    id: { type: 'uuid', primary: true },
    name: { type: 'string', required: true },
    email: { type: 'string', required: false },
  },
});
`);

    // Third run - should regenerate
    const thirdRun = await runGenerateCommand(testDir);
    expect(thirdRun.success).toBe(true);
    expect(thirdRun.stdout).toContain('Generating');

    // Content should be different
    const thirdContent = readFileSync(outputFile, 'utf-8');
    expect(thirdContent).not.toBe(firstContent);
    expect(thirdContent).toContain('email');
  });
});

// Helper function to run the generate command
async function runGenerateCommand(
  cwd: string,
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  // For now, this is a placeholder - the actual CLI command doesn't exist yet
  // When implemented, this would call the vertz generate CLI
  try {
    // Try to run the CLI if it exists
    const stdout = execSync('npx vertz generate', {
      cwd,
      encoding: 'utf-8',
      timeout: 30000,
    });
    return { success: true, stdout, stderr: '' };
  } catch (error: any) {
    // If command doesn't exist yet, return failure with message
    return {
      success: false,
      stdout: '',
      stderr: error.message || 'Command not implemented yet',
    };
  }
}
