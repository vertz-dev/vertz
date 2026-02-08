import { describe, expect, it } from 'vitest';
import { generateRailwayConfig } from '../railway';

describe('generateRailwayConfig', () => {
  it('generates railway.toml file', () => {
    const files = generateRailwayConfig('bun');
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe('railway.toml');
  });

  it('includes build command for bun', () => {
    const files = generateRailwayConfig('bun');
    expect(files[0]?.content).toContain('bun run build');
  });

  it('includes build command for node', () => {
    const files = generateRailwayConfig('node');
    expect(files[0]?.content).toContain('npm run build');
  });

  it('includes start command', () => {
    const files = generateRailwayConfig('bun');
    expect(files[0]?.content).toContain('startCommand');
  });
});
