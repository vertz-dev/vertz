import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

describe('lefthook configuration', () => {
  const loadConfig = () => {
    const monorepoRoot = path.resolve(process.cwd(), '../..');
    const lefthookPath = path.join(monorepoRoot, 'lefthook.yml');
    const content = fs.readFileSync(lefthookPath, 'utf-8');
    return YAML.parse(content);
  };

  it('should have pre-push hook with quality-gates command', () => {
    const config = loadConfig();

    expect(config).toHaveProperty('pre-push');
    expect(config['pre-push']).toHaveProperty('commands');
    expect(config['pre-push'].commands).toHaveProperty('quality-gates');
    expect(config['pre-push'].commands['quality-gates']).toHaveProperty('run');
  });

  it('should run turborepo for lint, typecheck, and test', () => {
    const config = loadConfig();
    const run = config['pre-push'].commands['quality-gates'].run;

    // Must use turborepo (not dagger, not bare bun run)
    expect(run).toContain('turbo');
    expect(run).toContain('lint');
    expect(run).toContain('typecheck');
    expect(run).toContain('test');

    // Should NOT reference dagger (migrated away)
    expect(run).not.toContain('dagger');
  });

  it('should not require LEFTHOOK=0 environment variable', () => {
    const config = loadConfig();

    // pre-push must have at least one command that works without skipping
    expect(config['pre-push'].commands).toBeDefined();
    expect(Object.keys(config['pre-push'].commands).length).toBeGreaterThanOrEqual(1);
  });
});
