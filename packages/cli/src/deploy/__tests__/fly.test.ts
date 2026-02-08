import { describe, expect, it } from 'vitest';
import { generateFlyConfig } from '../fly';

describe('generateFlyConfig', () => {
  it('generates fly.toml and Dockerfile', () => {
    const files = generateFlyConfig('bun', 3000);
    expect(files.length).toBeGreaterThanOrEqual(2);
    expect(files.some((f) => f.path === 'fly.toml')).toBe(true);
    expect(files.some((f) => f.path === 'Dockerfile')).toBe(true);
  });

  it('fly.toml includes internal port', () => {
    const files = generateFlyConfig('bun', 3000);
    const flyToml = files.find((f) => f.path === 'fly.toml');
    expect(flyToml?.content).toContain('internal_port = 3000');
  });

  it('fly.toml includes health check', () => {
    const files = generateFlyConfig('bun', 3000);
    const flyToml = files.find((f) => f.path === 'fly.toml');
    expect(flyToml?.content).toContain('health');
  });

  it('Dockerfile uses appropriate base image for bun', () => {
    const files = generateFlyConfig('bun', 3000);
    const dockerfile = files.find((f) => f.path === 'Dockerfile');
    expect(dockerfile?.content).toContain('oven/bun');
  });

  it('Dockerfile uses appropriate base image for node', () => {
    const files = generateFlyConfig('node', 3000);
    const dockerfile = files.find((f) => f.path === 'Dockerfile');
    expect(dockerfile?.content).toContain('node:');
  });
});
