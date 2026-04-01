import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dir, '../..');
const CI_WORKFLOW_PATH = resolve(PROJECT_ROOT, '.github/workflows/ci.yml');
const CODECOV_CONFIG_PATH = resolve(PROJECT_ROOT, 'codecov.yml');

function extractWorkflowPackageLists(ciWorkflow: string): string[][] {
  return [...ciWorkflow.matchAll(/for pkg in ([^;]+); do/g)].map((match) =>
    match[1].trim().split(/\s+/).filter(Boolean),
  );
}

function extractCodecovFlags(codecovConfig: string): string[] {
  const flagsBlock = codecovConfig.split('\nflags:\n')[1];
  if (!flagsBlock) {
    throw new TypeError('Missing flags block in codecov.yml');
  }

  return [...flagsBlock.matchAll(/^  ([a-z0-9-]+):$/gm)].map((match) => match[1]);
}

function missingPackageDirs(packageNames: string[]): string[] {
  return packageNames.filter(
    (packageName) => !existsSync(resolve(PROJECT_ROOT, `packages/${packageName}`)),
  );
}

describe('CI coverage package configuration', () => {
  it('only references package directories that exist in the coverage workflow', () => {
    const ciWorkflow = readFileSync(CI_WORKFLOW_PATH, 'utf8');
    const workflowPackageLists = extractWorkflowPackageLists(ciWorkflow);

    expect(workflowPackageLists.length).toBeGreaterThan(0);

    for (const packageList of workflowPackageLists) {
      expect(missingPackageDirs(packageList)).toEqual([]);
    }
  });

  it('only declares Codecov flags for package directories that exist', () => {
    const codecovConfig = readFileSync(CODECOV_CONFIG_PATH, 'utf8');
    const codecovFlags = extractCodecovFlags(codecovConfig);

    expect(codecovFlags.length).toBeGreaterThan(0);
    expect(missingPackageDirs(codecovFlags)).toEqual([]);
  });
});
