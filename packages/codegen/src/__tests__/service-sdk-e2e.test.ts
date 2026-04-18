import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppIR } from '@vertz/compiler';
import { createEmptyAppIR } from '@vertz/compiler';
import { resolveCodegenConfig } from '../config';
import { generate } from '../generate';

function makeServiceAppIR(): AppIR {
  const appIR = createEmptyAppIR();
  appIR.services = [
    {
      name: 'ai',
      inject: [],
      access: { parse: 'function', status: 'function' },
      actions: [
        {
          name: 'parse',
          method: 'POST',
          path: '/ai/parse',
          body: {
            kind: 'inline',
            sourceFile: 'ai.ts',
            resolvedFields: [
              { name: 'projectId', tsType: 'string', optional: false },
              { name: 'message', tsType: 'string', optional: false },
            ],
          },
          response: {
            kind: 'inline',
            sourceFile: 'ai.ts',
            resolvedFields: [
              { name: 'parsed', tsType: 'boolean', optional: false },
              { name: 'tokens', tsType: 'number', optional: true },
            ],
          },
        },
        {
          name: 'status',
          method: 'GET',
          path: '/ai/status/:requestId',
          response: {
            kind: 'inline',
            sourceFile: 'ai.ts',
            resolvedFields: [
              { name: 'status', tsType: 'string', optional: false },
              { name: 'updatedAt', tsType: 'string', optional: false },
            ],
          },
        },
      ],
      sourceFile: 'ai.ts',
      sourceLine: 1,
      sourceColumn: 1,
    },
  ];
  return appIR;
}

describe('Feature: service SDK end-to-end pipeline', () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'vertz-codegen-service-e2e-'));
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  describe('Given a fixture app with one standalone service and two actions', () => {
    describe('When the full codegen pipeline runs', () => {
      it('Then types/services/ai.ts exists and exports ParseAiInput, ParseAiOutput, StatusAiOutput', async () => {
        const config = resolveCodegenConfig({
          outputDir,
          generators: ['typescript'],
          format: false,
        });
        await generate(makeServiceAppIR(), config);
        const typesFile = readFileSync(join(outputDir, 'types/services/ai.ts'), 'utf-8');
        expect(typesFile).toContain('export interface ParseAiInput');
        expect(typesFile).toContain('projectId: string');
        expect(typesFile).toContain('message: string');
        expect(typesFile).toContain('export interface ParseAiOutput');
        expect(typesFile).toContain('parsed: boolean');
        expect(typesFile).toContain('tokens?: number');
        expect(typesFile).toContain('export interface StatusAiOutput');
        expect(typesFile).toContain('status: string');
        expect(typesFile).toContain('updatedAt: string');
      });

      it('Then services/ai.ts imports those types from ../types/services/ai', async () => {
        const config = resolveCodegenConfig({
          outputDir,
          generators: ['typescript'],
          format: false,
        });
        await generate(makeServiceAppIR(), config);
        const sdk = readFileSync(join(outputDir, 'services/ai.ts'), 'utf-8');
        expect(sdk).toContain(
          "import type { ParseAiInput, ParseAiOutput, StatusAiOutput } from '../types/services/ai';",
        );
      });

      it('Then services/ai.ts parse signature is (body: ParseAiInput) and client call is client.post<ParseAiOutput>', async () => {
        const config = resolveCodegenConfig({
          outputDir,
          generators: ['typescript'],
          format: false,
        });
        await generate(makeServiceAppIR(), config);
        const sdk = readFileSync(join(outputDir, 'services/ai.ts'), 'utf-8');
        expect(sdk).toContain('(body: ParseAiInput)');
        expect(sdk).toContain('client.post<ParseAiOutput>');
      });

      it('Then services/ai.ts status signature is (requestId: string) and client call is client.get<StatusAiOutput>', async () => {
        const config = resolveCodegenConfig({
          outputDir,
          generators: ['typescript'],
          format: false,
        });
        await generate(makeServiceAppIR(), config);
        const sdk = readFileSync(join(outputDir, 'services/ai.ts'), 'utf-8');
        expect(sdk).toContain('(requestId: string)');
        expect(sdk).toContain('client.get<StatusAiOutput>');
        expect(sdk).toContain('`/ai/status/${requestId}`');
      });

      it('Then services/index.ts re-exports createAiSdk', async () => {
        const config = resolveCodegenConfig({
          outputDir,
          generators: ['typescript'],
          format: false,
        });
        await generate(makeServiceAppIR(), config);
        const indexFile = readFileSync(join(outputDir, 'services/index.ts'), 'utf-8');
        expect(indexFile).toContain("export { createAiSdk } from './ai';");
      });

      it('Then client.ts wires `ai: createAiSdk(client)` into createClient()', async () => {
        const config = resolveCodegenConfig({
          outputDir,
          generators: ['typescript'],
          format: false,
        });
        await generate(makeServiceAppIR(), config);
        expect(existsSync(join(outputDir, 'client.ts'))).toBe(true);
        const clientFile = readFileSync(join(outputDir, 'client.ts'), 'utf-8');
        expect(clientFile).toContain('createAiSdk');
      });
    });
  });

  describe('Given a fixture matching the entity-todo example webhooks service', () => {
    function makeWebhooksAppIR(): AppIR {
      const appIR = createEmptyAppIR();
      appIR.services = [
        {
          name: 'webhooks',
          inject: [],
          access: { sync: 'function' },
          actions: [
            {
              name: 'sync',
              method: 'POST',
              path: '/webhooks/sync',
              body: {
                kind: 'inline',
                sourceFile: 'webhooks.service.ts',
                resolvedFields: [
                  { name: 'event', tsType: 'string', optional: false },
                  { name: 'task', tsType: 'unknown', optional: false },
                ],
              },
              response: {
                kind: 'inline',
                sourceFile: 'webhooks.service.ts',
                resolvedFields: [
                  { name: 'ok', tsType: 'boolean', optional: false },
                  { name: 'todoId', tsType: 'string', optional: true },
                ],
              },
            },
          ],
          sourceFile: 'webhooks.service.ts',
          sourceLine: 1,
          sourceColumn: 1,
        },
      ];
      return appIR;
    }

    it('Then the generated sync action has body: SyncWebhooksInput', async () => {
      const config = resolveCodegenConfig({
        outputDir,
        generators: ['typescript'],
        format: false,
      });
      await generate(makeWebhooksAppIR(), config);
      const sdk = readFileSync(join(outputDir, 'services/webhooks.ts'), 'utf-8');
      expect(sdk).toContain('(body: SyncWebhooksInput)');
      expect(sdk).toContain('client.post<SyncWebhooksOutput>');
    });

    it('Then types/services/webhooks.ts exposes typed fields (ok + optional todoId)', async () => {
      const config = resolveCodegenConfig({
        outputDir,
        generators: ['typescript'],
        format: false,
      });
      await generate(makeWebhooksAppIR(), config);
      const typesFile = readFileSync(join(outputDir, 'types/services/webhooks.ts'), 'utf-8');
      expect(typesFile).toContain('export interface SyncWebhooksInput');
      expect(typesFile).toContain('event: string');
      expect(typesFile).toContain('export interface SyncWebhooksOutput');
      expect(typesFile).toContain('ok: boolean');
      expect(typesFile).toContain('todoId?: string');
    });

    it('Then the generated SDK routes POST to /webhooks/sync', async () => {
      const config = resolveCodegenConfig({
        outputDir,
        generators: ['typescript'],
        format: false,
      });
      await generate(makeWebhooksAppIR(), config);
      const sdk = readFileSync(join(outputDir, 'services/webhooks.ts'), 'utf-8');
      expect(sdk).toContain("'/webhooks/sync'");
      expect(sdk).toContain("'POST'");
    });
  });

  describe('Given a service with mixed access (one action with access, one without)', () => {
    function makeMixedAccessAppIR(): AppIR {
      const appIR = createEmptyAppIR();
      appIR.services = [
        {
          name: 'billing',
          inject: [],
          access: { allowed: 'function' },
          actions: [
            {
              name: 'allowed',
              method: 'POST',
              path: '/billing/allowed',
              body: {
                kind: 'inline',
                sourceFile: 'billing.ts',
                resolvedFields: [{ name: 'amount', tsType: 'number', optional: false }],
              },
              response: {
                kind: 'inline',
                sourceFile: 'billing.ts',
                resolvedFields: [{ name: 'ok', tsType: 'boolean', optional: false }],
              },
            },
            {
              name: 'denied',
              method: 'POST',
              path: '/billing/denied',
              body: {
                kind: 'inline',
                sourceFile: 'billing.ts',
                resolvedFields: [{ name: 'secret', tsType: 'string', optional: false }],
              },
              response: {
                kind: 'inline',
                sourceFile: 'billing.ts',
                resolvedFields: [{ name: 'token', tsType: 'string', optional: false }],
              },
            },
          ],
          sourceFile: 'billing.ts',
          sourceLine: 1,
          sourceColumn: 1,
        },
      ];
      return appIR;
    }

    it('Then the SDK includes the action with access resolved to function', async () => {
      const config = resolveCodegenConfig({
        outputDir,
        generators: ['typescript'],
        format: false,
      });
      await generate(makeMixedAccessAppIR(), config);
      const sdk = readFileSync(join(outputDir, 'services/billing.ts'), 'utf-8');
      expect(sdk).toContain('allowed:');
      expect(sdk).toContain("'/billing/allowed'");
    });

    it('Then the SDK excludes the action with no access entry (deny-by-default)', async () => {
      const config = resolveCodegenConfig({
        outputDir,
        generators: ['typescript'],
        format: false,
      });
      await generate(makeMixedAccessAppIR(), config);
      const sdk = readFileSync(join(outputDir, 'services/billing.ts'), 'utf-8');
      expect(sdk).not.toContain('denied:');
      expect(sdk).not.toContain("'/billing/denied'");
    });

    it('Then types/services/billing.ts excludes types for the denied action', async () => {
      const config = resolveCodegenConfig({
        outputDir,
        generators: ['typescript'],
        format: false,
      });
      await generate(makeMixedAccessAppIR(), config);
      const typesFile = readFileSync(join(outputDir, 'types/services/billing.ts'), 'utf-8');
      expect(typesFile).toContain('AllowedBillingInput');
      expect(typesFile).not.toContain('DeniedBillingInput');
      expect(typesFile).not.toContain('DeniedBillingOutput');
    });
  });
});
