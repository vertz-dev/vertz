import { describe, expect, it } from '@vertz/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dir, '../..');
const CODECOV_CONFIG_PATH = resolve(PROJECT_ROOT, 'codecov.yml');

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
  it('only declares Codecov flags for package directories that exist', () => {
    const codecovConfig = readFileSync(CODECOV_CONFIG_PATH, 'utf8');
    const codecovFlags = extractCodecovFlags(codecovConfig);

    expect(codecovFlags.length).toBeGreaterThan(0);
    expect(missingPackageDirs(codecovFlags)).toEqual([]);
  });
});
