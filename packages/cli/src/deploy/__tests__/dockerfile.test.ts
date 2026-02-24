import { describe, expect, it } from 'bun:test';
import { generateDockerConfig } from '../dockerfile';

describe('generateDockerConfig', () => {
  it('generates Dockerfile for bun runtime', () => {
    const files = generateDockerConfig('bun', 3000);
    const dockerfile = files.find((f) => f.path === 'Dockerfile');
    expect(dockerfile).toBeDefined();
    expect(dockerfile?.content).toContain('oven/bun');
  });

  it('generates Dockerfile for node runtime', () => {
    const files = generateDockerConfig('node', 3000);
    const dockerfile = files.find((f) => f.path === 'Dockerfile');
    expect(dockerfile).toBeDefined();
    expect(dockerfile?.content).toContain('node:');
  });

  it('includes multi-stage build', () => {
    const files = generateDockerConfig('bun', 3000);
    const dockerfile = files.find((f) => f.path === 'Dockerfile');
    expect(dockerfile?.content).toContain('AS build');
    expect(dockerfile?.content).toContain('AS production');
  });

  it('sets EXPOSE port', () => {
    const files = generateDockerConfig('bun', 8080);
    const dockerfile = files.find((f) => f.path === 'Dockerfile');
    expect(dockerfile?.content).toContain('EXPOSE 8080');
  });

  it('generates .dockerignore file', () => {
    const files = generateDockerConfig('bun', 3000);
    const ignore = files.find((f) => f.path === '.dockerignore');
    expect(ignore).toBeDefined();
    expect(ignore?.content).toContain('node_modules');
    expect(ignore?.content).toContain('.git');
    expect(ignore?.content).toContain('.vertz');
  });
});
