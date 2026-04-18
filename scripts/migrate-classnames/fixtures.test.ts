import { describe, expect, it } from '@vertz/test';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { rewriteSource } from './rewriter';

const FIXTURES_DIR = resolve(import.meta.dir, '__fixtures__');
const INPUT_DIR = join(FIXTURES_DIR, 'input');
const EXPECTED_DIR = join(FIXTURES_DIR, 'expected');

function listFixtures(): string[] {
  return readdirSync(INPUT_DIR)
    .filter((name) => extname(name) === '.tsx' || extname(name) === '.ts')
    .sort();
}

describe('migration fixtures', () => {
  const fixtures = listFixtures();

  it('has at least 10 fixture pairs', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
  });

  for (const name of fixtures) {
    it(`rewrites ${name} to match expected output`, () => {
      const input = readFileSync(join(INPUT_DIR, name), 'utf8');
      const expected = readFileSync(join(EXPECTED_DIR, name), 'utf8');
      const result = rewriteSource(input, name);
      expect(result.code).toBe(expected);
    });

    it(`is idempotent for ${name} (expected → expected)`, () => {
      const expected = readFileSync(join(EXPECTED_DIR, name), 'utf8');
      const result = rewriteSource(expected, name);
      expect(result.code).toBe(expected);
      expect(result.changed).toBe(false);
    });
  }
});
