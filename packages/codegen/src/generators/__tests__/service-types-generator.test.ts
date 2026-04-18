import { describe, expect, it } from '@vertz/test';
import type { CodegenIR, CodegenServiceModule } from '../../types';
import { ServiceTypesGenerator } from '../service-types-generator';

function createIR(services: CodegenServiceModule[]): CodegenIR {
  return {
    basePath: '/api',
    modules: [],
    schemas: [],
    entities: [],
    services,
    auth: { schemes: [], operations: [] },
  };
}

describe('Feature: ServiceTypesGenerator', () => {
  const generator = new ServiceTypesGenerator();

  describe('Given a service with an action that has resolvedInputFields + resolvedOutputFields', () => {
    const ir = createIR([
      {
        serviceName: 'ai',
        actions: [
          {
            name: 'parse',
            method: 'POST',
            path: '/ai/parse',
            operationId: 'parseAi',
            inputSchema: 'ParseAiInput',
            outputSchema: 'ParseAiOutput',
            resolvedInputFields: [
              { name: 'projectId', tsType: 'string', optional: false },
              { name: 'message', tsType: 'string', optional: false },
              { name: 'debug', tsType: 'boolean', optional: true },
            ],
            resolvedOutputFields: [
              { name: 'id', tsType: 'string', optional: false },
              { name: 'createdAt', tsType: 'date', optional: false },
            ],
          },
        ],
      },
    ]);

    describe('When the generator runs', () => {
      it('Then emits types/services/{serviceName}.ts', () => {
        const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
        expect(files.find((f) => f.path === 'types/services/ai.ts')).toBeDefined();
      });

      it('Then file exports `export interface ${ActionPascal}${ServicePascal}Input`', () => {
        const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
        const aiFile = files.find((f) => f.path === 'types/services/ai.ts');
        expect(aiFile?.content).toContain('export interface ParseAiInput');
        expect(aiFile?.content).toContain('projectId: string');
        expect(aiFile?.content).toContain('message: string');
      });

      it('Then file exports `export interface ${ActionPascal}${ServicePascal}Output`', () => {
        const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
        const aiFile = files.find((f) => f.path === 'types/services/ai.ts');
        expect(aiFile?.content).toContain('export interface ParseAiOutput');
        expect(aiFile?.content).toContain('id: string');
      });

      it('Then field types follow TS_TYPE_MAP (date → string for JSON transport)', () => {
        const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
        const aiFile = files.find((f) => f.path === 'types/services/ai.ts');
        expect(aiFile?.content).toContain('createdAt: string');
      });

      it('Then optional fields are marked with `field?: T`', () => {
        const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
        const aiFile = files.find((f) => f.path === 'types/services/ai.ts');
        expect(aiFile?.content).toContain('debug?: boolean');
      });
    });
  });

  describe('Given a service with only GET actions that have no body schema', () => {
    const ir = createIR([
      {
        serviceName: 'status',
        actions: [
          {
            name: 'check',
            method: 'GET',
            path: '/status/check',
            operationId: 'checkStatus',
            outputSchema: 'CheckStatusOutput',
            resolvedOutputFields: [{ name: 'healthy', tsType: 'boolean', optional: false }],
          },
        ],
      },
    ]);

    it('Then no Input interface is emitted', () => {
      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const file = files.find((f) => f.path === 'types/services/status.ts');
      expect(file?.content).not.toContain('CheckStatusInput');
    });

    it('Then Output interfaces are emitted for responses with resolvedOutputFields', () => {
      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const file = files.find((f) => f.path === 'types/services/status.ts');
      expect(file?.content).toContain('export interface CheckStatusOutput');
      expect(file?.content).toContain('healthy: boolean');
    });
  });

  describe('Given a service with no resolved fields at all', () => {
    const ir = createIR([
      {
        serviceName: 'empty',
        actions: [
          {
            name: 'ping',
            method: 'GET',
            path: '/empty/ping',
            operationId: 'pingEmpty',
          },
        ],
      },
    ]);

    it('Then no file is emitted for that service', () => {
      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      expect(files.find((f) => f.path === 'types/services/empty.ts')).toBeUndefined();
    });
  });

  describe('Given the IR has no services at all', () => {
    it('Then generate() returns []', () => {
      const ir = createIR([]);
      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      expect(files).toEqual([]);
    });
  });
});
