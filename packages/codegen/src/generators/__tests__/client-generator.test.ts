import { describe, expect, it } from 'bun:test';
import type { CodegenEntityModule, CodegenIR } from '../../types';
import { ClientGenerator } from '../client-generator';

describe('ClientGenerator', () => {
  const generator = new ClientGenerator();

  function createBasicIR(entities: CodegenEntityModule[]): CodegenIR {
    return {
      basePath: '/api',
      modules: [],
      schemas: [],
      entities,
      auth: { schemes: [] },
    };
  }

  describe('client.ts', () => {
    it('generates createClient with a single entity', () => {
      const ir = createBasicIR([
        {
          entityName: 'user',
          operations: [
            {
              kind: 'list',
              method: 'GET',
              path: '/user',
              operationId: 'listUser',
              outputSchema: 'UserResponse',
            },
          ],
          actions: [],
        },
      ]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const clientFile = files.find((f) => f.path === 'client.ts');

      expect(clientFile).toBeDefined();
      expect(clientFile?.content).toContain("import { FetchClient } from '@vertz/fetch'");
      expect(clientFile?.content).toContain("import { createUserSdk } from './entities/user'");
      expect(clientFile?.content).toContain('export interface ClientOptions');
      expect(clientFile?.content).toContain('baseURL?: string');
      expect(clientFile?.content).toContain('export function createClient');
      expect(clientFile?.content).toContain("'/api'");
      expect(clientFile?.content).toContain('user: createUserSdk(client)');
      expect(clientFile?.content).toContain('export type Client = ReturnType<typeof createClient>');
    });

    it('generates createClient with multiple entities', () => {
      const ir = createBasicIR([
        {
          entityName: 'user',
          operations: [],
          actions: [],
        },
        {
          entityName: 'post',
          operations: [],
          actions: [],
        },
      ]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const clientFile = files.find((f) => f.path === 'client.ts');

      expect(clientFile).toBeDefined();
      expect(clientFile?.content).toContain("import { createUserSdk } from './entities/user'");
      expect(clientFile?.content).toContain("import { createPostSdk } from './entities/post'");
      expect(clientFile?.content).toContain('user: createUserSdk(client)');
      expect(clientFile?.content).toContain('post: createPostSdk(client)');
    });

    it('generates valid createClient with no entities', () => {
      const ir = createBasicIR([]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const clientFile = files.find((f) => f.path === 'client.ts');

      expect(clientFile).toBeDefined();
      expect(clientFile?.content).toContain('export function createClient');
      expect(clientFile?.content).toContain('return {}');
    });

    it('handles hyphenated entity names', () => {
      const ir = createBasicIR([
        {
          entityName: 'blog-post',
          operations: [],
          actions: [],
        },
      ]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const clientFile = files.find((f) => f.path === 'client.ts');

      expect(clientFile).toBeDefined();
      expect(clientFile?.content).toContain(
        "import { createBlogPostSdk } from './entities/blog-post'",
      );
      expect(clientFile?.content).toContain('blogPost: createBlogPostSdk(client)');
    });

    it('includes ClientOptions with headers and timeoutMs', () => {
      const ir = createBasicIR([]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const clientFile = files.find((f) => f.path === 'client.ts');

      expect(clientFile?.content).toContain('headers?: Record<string, string>');
      expect(clientFile?.content).toContain('timeoutMs?: number');
    });
  });

  describe('package.json', () => {
    it('generates valid package.json with exports', () => {
      const ir = createBasicIR([]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const pkgFile = files.find((f) => f.path === 'package.json');

      expect(pkgFile).toBeDefined();
      const pkg = JSON.parse(pkgFile?.content);
      expect(pkg.name).toBe('.vertz-generated');
      expect(pkg.private).toBe(true);
      expect(pkg.exports['.']).toBe('./client.ts');
      expect(pkg.exports['./types']).toBe('./types/index.ts');
    });
  });

  describe('README.md', () => {
    it('generates README with usage instructions', () => {
      const ir = createBasicIR([
        {
          entityName: 'todos',
          operations: [
            {
              kind: 'list',
              method: 'GET',
              path: '/todos',
              operationId: 'listTodos',
              outputSchema: 'TodosResponse',
            },
            {
              kind: 'create',
              method: 'POST',
              path: '/todos',
              operationId: 'createTodos',
              inputSchema: 'CreateTodosInput',
              outputSchema: 'TodosResponse',
            },
          ],
          actions: [],
        },
      ]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const readmeFile = files.find((f) => f.path === 'README.md');

      expect(readmeFile).toBeDefined();
      expect(readmeFile?.content).toContain('createClient');
      expect(readmeFile?.content).toContain('.vertz/generated');
      expect(readmeFile?.content).toContain('/types');
      expect(readmeFile?.content).toContain('todos');
    });

    it('generates README with no entities', () => {
      const ir = createBasicIR([]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const readmeFile = files.find((f) => f.path === 'README.md');

      expect(readmeFile).toBeDefined();
      expect(readmeFile?.content).toContain('createClient');
    });
  });

  it('always generates exactly 3 files', () => {
    const ir = createBasicIR([
      {
        entityName: 'user',
        operations: [],
        actions: [],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });

    expect(files).toHaveLength(3);
    expect(files.map((f) => f.path).sort()).toEqual(['README.md', 'client.ts', 'package.json']);
  });
});
