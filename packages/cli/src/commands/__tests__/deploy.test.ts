import { describe, expect, it } from 'vitest';
import { deployAction } from '../deploy';

describe('deployAction', () => {
  it('generates railway config for target railway', () => {
    const result = deployAction({
      target: 'railway',
      runtime: 'bun',
      port: 3000,
      projectRoot: '/project',
    });
    expect(result.success).toBe(true);
    expect(result.files.some((f) => f.path === 'railway.toml')).toBe(true);
  });

  it('generates fly config for target fly', () => {
    const result = deployAction({
      target: 'fly',
      runtime: 'bun',
      port: 3000,
      projectRoot: '/project',
    });
    expect(result.success).toBe(true);
    expect(result.files.some((f) => f.path === 'fly.toml')).toBe(true);
  });

  it('generates docker config for target docker', () => {
    const result = deployAction({
      target: 'docker',
      runtime: 'bun',
      port: 3000,
      projectRoot: '/project',
    });
    expect(result.success).toBe(true);
    expect(result.files.some((f) => f.path === 'Dockerfile')).toBe(true);
  });

  it('fails for invalid target', () => {
    const result = deployAction({
      target: 'heroku' as never,
      runtime: 'bun',
      port: 3000,
      projectRoot: '/project',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Unknown deploy target');
    }
  });

  it('uses node runtime when specified', () => {
    const result = deployAction({
      target: 'docker',
      runtime: 'node',
      port: 3000,
      projectRoot: '/project',
    });
    expect(result.success).toBe(true);
    const dockerfile = result.files.find((f) => f.path === 'Dockerfile');
    expect(dockerfile?.content).toContain('node:');
  });

  it('uses custom port', () => {
    const result = deployAction({
      target: 'docker',
      runtime: 'bun',
      port: 8080,
      projectRoot: '/project',
    });
    expect(result.success).toBe(true);
    const dockerfile = result.files.find((f) => f.path === 'Dockerfile');
    expect(dockerfile?.content).toContain('EXPOSE 8080');
  });
});
