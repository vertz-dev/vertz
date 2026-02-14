import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

describe('lefthook configuration', () => {
  it('should have quality-gates command that runs typecheck and lint without dagger', () => {
    const lefthookPath = path.join(process.cwd(), 'lefthook.yml');
    const content = fs.readFileSync(lefthookPath, 'utf-8');
    const config = YAML.parse(content);

    // Pre-push hook must exist
    expect(config).toHaveProperty('pre-push');
    expect(config['pre-push']).toHaveProperty('commands');

    const commands = config['pre-push'].commands;

    // quality-gates command must exist
    expect(commands).toHaveProperty('quality-gates');
    expect(commands['quality-gates']).toHaveProperty('run');

    const qualityGatesRun = commands['quality-gates'].run;

    // Must run typecheck and lint without requiring dagger
    expect(qualityGatesRun).toContain('bun run typecheck');
    expect(qualityGatesRun).toContain('bun run lint');

    // Should NOT require dagger (no "dagger call" in the command)
    expect(qualityGatesRun).not.toContain('dagger');
  });

  it('should have ci command that runs dagger conditionally', () => {
    const lefthookPath = path.join(process.cwd(), 'lefthook.yml');
    const content = fs.readFileSync(lefthookPath, 'utf-8');
    const config = YAML.parse(content);

    const commands = config['pre-push'].commands;

    // ci command must exist
    expect(commands).toHaveProperty('ci');
    expect(commands.ci).toHaveProperty('run');

    const ciRun = commands.ci.run;

    // Should contain dagger call
    expect(ciRun).toContain('dagger');

    // Should check if dagger is available (conditional execution)
    expect(ciRun).toMatch(/command -v dagger|if.*dagger|which dagger/);
  });

  it('should not require LEFTHOOK=0 environment variable', () => {
    // This is a structural test - the configuration should work
    // without needing to skip via LEFTHOOK=0
    const lefthookPath = path.join(process.cwd(), 'lefthook.yml');
    const content = fs.readFileSync(lefthookPath, 'utf-8');
    const config = YAML.parse(content);

    // Ensure pre-push has commands that don't unconditionally fail
    expect(config['pre-push'].commands).toBeDefined();

    // Both quality-gates and ci should exist
    const commands = config['pre-push'].commands;
    expect(Object.keys(commands).length).toBeGreaterThanOrEqual(2);
    expect(commands).toHaveProperty('quality-gates');
    expect(commands).toHaveProperty('ci');
  });
});
