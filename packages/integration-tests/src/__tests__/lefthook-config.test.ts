import { describe, expect, it } from '@vertz/test';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

describe('lefthook configuration', () => {
  const loadConfig = () => {
    const monorepoRoot = path.resolve(import.meta.dir, '../../../..');
    const lefthookPath = path.join(monorepoRoot, 'lefthook.yml');
    const content = fs.readFileSync(lefthookPath, 'utf-8');
    return YAML.parse(content);
  };

  it('should have pre-push hook with build-typecheck and test commands', () => {
    const config = loadConfig();

    expect(config).toHaveProperty('pre-push');
    expect(config['pre-push']).toHaveProperty('commands');
    expect(config['pre-push'].commands).toHaveProperty('build-typecheck');
    expect(config['pre-push'].commands['build-typecheck']).toHaveProperty('run');
    expect(config['pre-push'].commands).toHaveProperty('test');
    expect(config['pre-push'].commands['test']).toHaveProperty('run');
  });

  it('should use vtz ci for typecheck and test, with lint as separate command', () => {
    const config = loadConfig();
    const buildTypecheck = config['pre-push'].commands['build-typecheck'].run;
    const test = config['pre-push'].commands['test'].run;

    // Must use vtz ci (not turbo, not dagger)
    expect(buildTypecheck).toContain('vtz ci build-typecheck');
    expect(test).toContain('vtz ci test');

    // Lint runs as a separate lefthook command
    expect(config['pre-push'].commands).toHaveProperty('lint');

    // Should NOT reference dagger or turbo (migrated away)
    expect(buildTypecheck).not.toContain('dagger');
    expect(buildTypecheck).not.toContain('turbo');
  });

  it('should not require LEFTHOOK=0 environment variable', () => {
    const config = loadConfig();

    // pre-push must have at least one command that works without skipping
    expect(config['pre-push'].commands).toBeDefined();
    expect(Object.keys(config['pre-push'].commands).length).toBeGreaterThanOrEqual(1);
  });
});
