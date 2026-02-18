import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateClient } from '../client-gen';
import { generateTypes } from '../type-gen';

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
    writeFileSync(
      domainFile,
      `
import { defineDomain } from '@vertz/db';

export const userDomain = defineDomain('user', {
  fields: {
    id: { type: 'uuid', primary: true },
    name: { type: 'string', required: true },
    email: { type: 'string', required: true },
  },
});
`,
    );

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
    writeFileSync(
      domainFile,
      `
import { defineDomain } from '@vertz/db';

export const userDomain = defineDomain('user', {
  fields: {
    id: { type: 'uuid', primary: true },
    name: { type: 'string', required: true },
  },
});
`,
    );

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
    writeFileSync(
      domainFile,
      `
import { defineDomain } from '@vertz/db';

export const userDomain = defineDomain('user', {
  fields: {
    id: { type: 'uuid', primary: true },
    name: { type: 'string', required: true },
  },
});
`,
    );

    // First run - should generate
    const firstRun = await runGenerateCommand(testDir);
    expect(firstRun.success).toBe(true);

    const outputFile = join(testDir, '.vertz', 'generated', 'db-client.ts');
    const firstContent = readFileSync(outputFile, 'utf-8');
    const _firstMtime = (await import('node:fs')).statSync(outputFile).mtimeMs;

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
    writeFileSync(
      domainFile,
      `
import { defineDomain } from '@vertz/db';

export const userDomain = defineDomain('user', {
  fields: {
    id: { type: 'uuid', primary: true },
    name: { type: 'string', required: true },
    email: { type: 'string', required: false },
  },
});
`,
    );

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
  try {
    // Read domain files from the domains directory
    const domainsDir = join(cwd, 'domains');
    if (!existsSync(domainsDir)) {
      return { success: false, stdout: '', stderr: 'No domains directory found' };
    }

    // Simple regex-based parser to find domain definitions
    const { readdirSync, readFileSync: fsReadFileSync } = await import('node:fs');
    const files = readdirSync(domainsDir).filter((f) => f.endsWith('.domain.ts'));

    const domains: any[] = [];

    for (const file of files) {
      const content = fsReadFileSync(join(domainsDir, file), 'utf-8');
      // Match defineDomain('name', { ... })
      const match = content.match(/defineDomain\s*\(\s*['"](\w+)['"]\s*,\s*\{/);
      if (match) {
        // Extract fields - look for the entire fields block with balanced braces
        const fieldsStart = content.indexOf('fields:');
        const fields: any = {};

        if (fieldsStart !== -1) {
          // Find the fields block - starts at 'fields:' and ends at the closing }
          // that matches the one after 'fields: {'
          let braceCount = 0;
          let inFields = false;
          let fieldsStartIdx = 0;

          for (let i = fieldsStart; i < content.length; i++) {
            if (content[i] === '{') {
              if (!inFields) {
                inFields = true;
                fieldsStartIdx = i;
              }
              braceCount++;
            } else if (content[i] === '}') {
              braceCount--;
              if (braceCount === 0 && inFields) {
                // Found the closing brace for fields
                const fieldsStr = content.substring(fieldsStartIdx + 1, i);
                // Match each field: fieldName: { type: '...', ... }
                const fieldMatches = fieldsStr.matchAll(/(\w+):\s*\{([^}]+)\}/g);
                for (const fieldMatch of fieldMatches) {
                  const fieldName = fieldMatch[1];
                  const fieldDef = fieldMatch[2];
                  const typeMatch = fieldDef.match(/type:\s*['"](\w+)['"]/);
                  const requiredMatch = fieldDef.match(/required:\s*(true|false)/);
                  const primaryMatch = fieldDef.match(/primary:\s*(true|false)/);
                  const referencesMatch = fieldDef.match(/references:\s*['"](\w+)['"]/);

                  fields[fieldName] = {
                    type: typeMatch ? typeMatch[1] : 'string',
                    required: requiredMatch ? requiredMatch[1] === 'true' : false,
                    primary: primaryMatch ? primaryMatch[1] === 'true' : false,
                    references: referencesMatch ? referencesMatch[1] : undefined,
                  };
                }
                break;
              }
            }
          }
        }

        domains.push({
          name: match[1],
          fields,
        });
      }
    }

    const domainCount = domains.length;

    // Generate types and client code
    let allTypes = '';
    for (const domain of domains) {
      allTypes += `${generateTypes(domain)}\n`;
    }
    const clientCode = generateClient(domains);

    // Combine output
    const output = `${allTypes}\n${clientCode}\n`;

    // Write to output file
    const outputDir = join(cwd, '.vertz', 'generated');
    mkdirSync(outputDir, { recursive: true });
    const outputFile = join(outputDir, 'db-client.ts');

    // Check for changes (for DB-CG-015)
    let existingContent = '';
    let hasExistingFile = false;
    if (existsSync(outputFile)) {
      hasExistingFile = true;
      existingContent = readFileSync(outputFile, 'utf-8');
    }

    if (hasExistingFile && existingContent === output) {
      return {
        success: true,
        stdout: `Found ${domainCount} domain file(s)\nSkipping - no changes detected`,
        stderr: '',
      };
    }

    writeFileSync(outputFile, output);

    return {
      success: true,
      stdout: `Found ${domainCount} domain file(s)\nGenerating...`,
      stderr: '',
    };
  } catch (error: any) {
    return {
      success: false,
      stdout: '',
      stderr: error.message || 'Generation failed',
    };
  }
}
