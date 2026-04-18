import { describe, expect, it } from '@vertz/test';
import { ServiceSdkGenerator } from '../generators/service-sdk-generator';
import type { CodegenIR, CodegenServiceModule } from '../types';

function makeIR(services: CodegenServiceModule[]): CodegenIR {
  return {
    basePath: '/api',
    modules: [],
    schemas: [],
    entities: [],
    services,
    auth: { schemes: [], operations: [] },
  };
}

function getSdkContent(services: CodegenServiceModule[], serviceName: string): string {
  const gen = new ServiceSdkGenerator();
  const files = gen.generate(makeIR(services), { outputDir: '.', options: {} });
  const file = files.find((f) => f.path === `services/${serviceName}.ts`);
  if (!file) throw new Error(`No file generated for service '${serviceName}'`);
  return file.content;
}

describe('ServiceSdkGenerator', () => {
  const gen = new ServiceSdkGenerator();

  it('returns empty array when no services exist', () => {
    const result = gen.generate(makeIR([]), { outputDir: '.', options: {} });
    expect(result).toEqual([]);
  });

  it('generates SDK file for a service with actions', () => {
    const ir = makeIR([
      {
        serviceName: 'notifications',
        actions: [
          {
            name: 'send',
            method: 'POST',
            path: '/notifications/send',
            operationId: 'sendNotifications',
          },
          {
            name: 'status',
            method: 'GET',
            path: '/notifications/status',
            operationId: 'statusNotifications',
          },
        ],
      },
    ]);
    const files = gen.generate(ir, { outputDir: '.', options: {} });
    expect(files).toHaveLength(2);

    const sdkFile = files.find((f) => f.path === 'services/notifications.ts');
    expect(sdkFile).toBeDefined();
    expect(sdkFile!.content).toContain('createNotificationsSdk');
    expect(sdkFile!.content).toContain('send: Object.assign(');
    expect(sdkFile!.content).toContain('status: Object.assign(');
  });

  it('generates GET action without body parameter', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'notifications',
          actions: [
            {
              name: 'status',
              method: 'GET',
              path: '/notifications/status',
              operationId: 'statusNotifications',
            },
          ],
        },
      ],
      'notifications',
    );
    expect(content).not.toContain('body:');
    expect(content).toContain('client.get');
  });

  it('generates index file re-exporting all services', () => {
    const ir = makeIR([
      {
        serviceName: 'notifications',
        actions: [
          {
            name: 'send',
            method: 'POST',
            path: '/notifications/send',
            operationId: 'sendNotifications',
          },
        ],
      },
      {
        serviceName: 'email-sender',
        actions: [
          {
            name: 'send',
            method: 'POST',
            path: '/email-sender/send',
            operationId: 'sendEmailSender',
          },
        ],
      },
    ]);
    const files = gen.generate(ir, { outputDir: '.', options: {} });
    const indexFile = files.find((f) => f.path === 'services/index.ts');
    expect(indexFile).toBeDefined();
    expect(indexFile!.content).toContain(
      "export { createNotificationsSdk } from './notifications'",
    );
    expect(indexFile!.content).toContain("export { createEmailSenderSdk } from './email-sender'");
  });

  it('uses custom path for actions with custom paths', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'notifications',
          actions: [
            {
              name: 'status',
              method: 'GET',
              path: 'notifications/status/:messageId',
              operationId: 'statusNotifications',
            },
          ],
        },
      ],
      'notifications',
    );
    expect(content).toContain('notifications/status/:messageId');
  });

  it('interpolates path parameters in generated SDK', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'notifications',
          actions: [
            {
              name: 'status',
              method: 'GET',
              path: '/notifications/status/:messageId',
              operationId: 'statusNotifications',
            },
          ],
        },
      ],
      'notifications',
    );
    expect(content).toContain('messageId: string');
    expect(content).toContain('`/notifications/status/${messageId}`');
    expect(content).toContain("url: '/notifications/status/:messageId'");
  });

  it('skips services with no actions', () => {
    const ir = makeIR([
      { serviceName: 'empty', actions: [] },
      {
        serviceName: 'notifications',
        actions: [
          {
            name: 'send',
            method: 'POST',
            path: '/notifications/send',
            operationId: 'sendNotifications',
          },
        ],
      },
    ]);
    const files = gen.generate(ir, { outputDir: '.', options: {} });
    expect(files).toHaveLength(2);
    expect(files.find((f) => f.path === 'services/empty.ts')).toBeUndefined();
  });

  // ── Mutation descriptor tests ──────────────────────────────────

  describe('Given a service with GET and POST actions', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'notifications',
          actions: [
            {
              name: 'send',
              method: 'POST',
              path: '/notifications/send',
              operationId: 'sendNotifications',
            },
            {
              name: 'status',
              method: 'GET',
              path: '/notifications/status',
              operationId: 'statusNotifications',
            },
          ],
        },
      ],
      'notifications',
    );

    it('uses createDescriptor for GET actions', () => {
      expect(content).toContain("createDescriptor('GET'");
      expect(content).not.toContain("createMutationDescriptor('GET'");
    });

    it('uses createMutationDescriptor for POST actions', () => {
      expect(content).toContain("createMutationDescriptor('POST'");
      expect(content).not.toContain("createDescriptor('POST'");
    });
  });

  it('uses createMutationDescriptor for PUT actions', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'tasks',
          actions: [
            { name: 'replace', method: 'PUT', path: '/tasks/replace', operationId: 'replaceTasks' },
          ],
        },
      ],
      'tasks',
    );
    expect(content).toContain("createMutationDescriptor('PUT'");
    expect(content).not.toContain("createDescriptor('PUT'");
  });

  it('uses createMutationDescriptor for PATCH actions', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'tasks',
          actions: [
            { name: 'update', method: 'PATCH', path: '/tasks/update', operationId: 'updateTasks' },
          ],
        },
      ],
      'tasks',
    );
    expect(content).toContain("createMutationDescriptor('PATCH'");
    expect(content).not.toContain("createDescriptor('PATCH'");
  });

  it('uses createMutationDescriptor for DELETE actions', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'tasks',
          actions: [
            { name: 'remove', method: 'DELETE', path: '/tasks/remove', operationId: 'removeTasks' },
          ],
        },
      ],
      'tasks',
    );
    expect(content).toContain("createMutationDescriptor('DELETE'");
    expect(content).not.toContain("createDescriptor('DELETE'");
  });

  // ── MutationMeta tests ──────────────────────────────────────

  it('passes body in MutationMeta for POST, not as query param to createDescriptor', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'notifications',
          actions: [
            {
              name: 'send',
              method: 'POST',
              path: '/notifications/send',
              operationId: 'sendNotifications',
            },
          ],
        },
      ],
      'notifications',
    );
    expect(content).toContain("entityType: 'notifications'");
    expect(content).toContain("kind: 'create' as const");
    expect(content).toContain('body }');
  });

  it('derives mutation kind from HTTP method', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'tasks',
          actions: [
            { name: 'create', method: 'POST', path: '/tasks', operationId: 'createTasks' },
            { name: 'replace', method: 'PUT', path: '/tasks/replace', operationId: 'replaceTasks' },
            { name: 'update', method: 'PATCH', path: '/tasks/update', operationId: 'updateTasks' },
            { name: 'remove', method: 'DELETE', path: '/tasks/remove', operationId: 'removeTasks' },
          ],
        },
      ],
      'tasks',
    );
    expect(content).toContain("kind: 'create' as const");
    expect(content).toContain("kind: 'update' as const");
    expect(content).toContain("kind: 'delete' as const");
  });

  it('passes first path param as id in MutationMeta for DELETE', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'notifications',
          actions: [
            {
              name: 'remove',
              method: 'DELETE',
              path: '/notifications/:messageId',
              operationId: 'removeNotifications',
            },
          ],
        },
      ],
      'notifications',
    );
    expect(content).toContain('messageId: string');
    expect(content).toContain('id: messageId');
  });

  it('includes both id and body in MutationMeta for PATCH with path params', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'tasks',
          actions: [
            { name: 'update', method: 'PATCH', path: '/tasks/:taskId', operationId: 'updateTasks' },
          ],
        },
      ],
      'tasks',
    );
    expect(content).toContain('taskId: string');
    expect(content).toContain('body: unknown');
    expect(content).toContain("kind: 'update' as const");
    expect(content).toContain('id: taskId');
    expect(content).toContain('body }');
  });

  it('omits id from MutationMeta for DELETE without path params', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'tasks',
          actions: [
            {
              name: 'clear_all',
              method: 'DELETE',
              path: '/tasks/clear',
              operationId: 'clearAllTasks',
            },
          ],
        },
      ],
      'tasks',
    );
    expect(content).toContain("kind: 'delete' as const");
    expect(content).not.toContain('id:');
  });

  // ── Import tests ──────────────────────────────────────

  it('imports only createDescriptor when service has only GET actions', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'notifications',
          actions: [
            {
              name: 'status',
              method: 'GET',
              path: '/notifications/status',
              operationId: 'statusNotifications',
            },
          ],
        },
      ],
      'notifications',
    );
    expect(content).toContain('createDescriptor');
    expect(content).not.toContain('createMutationDescriptor');
  });

  it('imports only createMutationDescriptor when service has only mutation actions', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'notifications',
          actions: [
            {
              name: 'send',
              method: 'POST',
              path: '/notifications/send',
              operationId: 'sendNotifications',
            },
          ],
        },
      ],
      'notifications',
    );
    expect(content).toContain('createMutationDescriptor');
    expect(content).not.toMatch(/\bcreateDescriptor\b/);
  });

  it('imports both createDescriptor and createMutationDescriptor when service has mixed actions', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'notifications',
          actions: [
            {
              name: 'send',
              method: 'POST',
              path: '/notifications/send',
              operationId: 'sendNotifications',
            },
            {
              name: 'status',
              method: 'GET',
              path: '/notifications/status',
              operationId: 'statusNotifications',
            },
          ],
        },
      ],
      'notifications',
    );
    expect(content).toContain('createDescriptor');
    expect(content).toContain('createMutationDescriptor');
  });

  it('always imports queryKey from @vertz/fetch', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'notifications',
          actions: [
            {
              name: 'status',
              method: 'GET',
              path: '/notifications/status',
              operationId: 'statusNotifications',
            },
          ],
        },
      ],
      'notifications',
    );
    expect(content).toContain('queryKey');
    expect(content).toContain("from '@vertz/fetch'");
  });

  // ── queryKey tests ──────────────────────────────────────

  it('generates .queryKey() on GET action with no path params', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'notifications',
          actions: [
            {
              name: 'status',
              method: 'GET',
              path: '/notifications/status',
              operationId: 'statusNotifications',
            },
          ],
        },
      ],
      'notifications',
    );
    expect(content).toContain("queryKey: () => queryKey({ path: '/notifications/status' })");
  });

  it('generates .queryKey() with optional path params mirroring the method signature', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'notifications',
          actions: [
            {
              name: 'status',
              method: 'GET',
              path: '/notifications/status/:messageId',
              operationId: 'statusNotifications',
            },
          ],
        },
      ],
      'notifications',
    );
    expect(content).toContain('queryKey: (messageId?: string)');
    expect(content).toContain("path: '/notifications/status/{messageId}'");
    expect(content).toContain('params: { messageId }');
  });

  it('generates .queryKey() on mutation actions', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'notifications',
          actions: [
            {
              name: 'send',
              method: 'POST',
              path: '/notifications/send',
              operationId: 'sendNotifications',
            },
          ],
        },
      ],
      'notifications',
    );
    expect(content).toContain("queryKey: () => queryKey({ path: '/notifications/send' })");
  });

  it('generates .queryKey() with optional path params on mutation actions', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'notifications',
          actions: [
            {
              name: 'remove',
              method: 'DELETE',
              path: '/notifications/:messageId',
              operationId: 'removeNotifications',
            },
          ],
        },
      ],
      'notifications',
    );
    expect(content).toContain('queryKey: (messageId?: string)');
    expect(content).toContain("path: '/notifications/{messageId}'");
    expect(content).toContain('params: { messageId }');
  });

  it('generates .queryKey() with multiple optional path params', () => {
    const content = getSdkContent(
      [
        {
          serviceName: 'teams',
          actions: [
            {
              name: 'get_member',
              method: 'GET',
              path: '/teams/:teamId/members/:memberId',
              operationId: 'getMemberTeams',
            },
          ],
        },
      ],
      'teams',
    );
    expect(content).toContain('queryKey: (teamId?: string, memberId?: string)');
    expect(content).toContain("path: '/teams/{teamId}/members/{memberId}'");
    expect(content).toContain('params: { teamId, memberId }');
  });

  // ── Typed SDK signatures (Phase C) ──────────────────────────────

  describe('Feature: typed ServiceSdkGenerator', () => {
    describe('Given an action with inputSchema + outputSchema', () => {
      const content = getSdkContent(
        [
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
                resolvedInputFields: [{ name: 'message', tsType: 'string', optional: false }],
                resolvedOutputFields: [{ name: 'id', tsType: 'string', optional: false }],
              },
            ],
          },
        ],
        'ai',
      );

      it('emits typed import from ../types/services/{serviceName}', () => {
        expect(content).toContain(
          "import type { ParseAiInput, ParseAiOutput } from '../types/services/ai';",
        );
      });

      it('function signature uses InputType for body', () => {
        expect(content).toContain('body: ParseAiInput');
        expect(content).not.toContain('body: unknown');
      });

      it('client call is typed with OutputType', () => {
        expect(content).toContain('client.post<ParseAiOutput>');
        expect(content).not.toContain('client.post<unknown>');
      });
    });

    describe('Given a GET action with outputSchema but no inputSchema and no path params', () => {
      const content = getSdkContent(
        [
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
        ],
        'status',
      );

      it('imports only the output type', () => {
        expect(content).toContain(
          "import type { CheckStatusOutput } from '../types/services/status';",
        );
        expect(content).not.toContain('CheckStatusInput');
      });

      it('client call is typed with OutputType', () => {
        expect(content).toContain('client.get<CheckStatusOutput>');
      });
    });

    describe('Given a GET action with outputSchema and one path param', () => {
      const content = getSdkContent(
        [
          {
            serviceName: 'tasks',
            actions: [
              {
                name: 'get_one',
                method: 'GET',
                path: '/tasks/:id',
                operationId: 'getOneTasks',
                outputSchema: 'GetOneTasksOutput',
                resolvedOutputFields: [{ name: 'id', tsType: 'string', optional: false }],
              },
            ],
          },
        ],
        'tasks',
      );

      it('path param keeps string typing', () => {
        expect(content).toContain('id: string');
      });

      it('path uses template literal interpolation', () => {
        expect(content).toContain('`/tasks/${id}`');
      });

      it('client call is typed with OutputType', () => {
        expect(content).toContain('client.get<GetOneTasksOutput>');
      });
    });

    describe('Given an action without inputSchema or outputSchema', () => {
      const content = getSdkContent(
        [
          {
            serviceName: 'legacy',
            actions: [
              {
                name: 'ping',
                method: 'POST',
                path: '/legacy/ping',
                operationId: 'pingLegacy',
              },
            ],
          },
        ],
        'legacy',
      );

      it('emits no typed import', () => {
        expect(content).not.toContain('../types/services/legacy');
      });

      it('falls back to body: unknown / client.post<unknown>', () => {
        expect(content).toContain('body: unknown');
        expect(content).toContain('client.post<unknown>');
      });
    });

    describe('Given a service with multiple typed actions', () => {
      const content = getSdkContent(
        [
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
                resolvedInputFields: [{ name: 'message', tsType: 'string', optional: false }],
                resolvedOutputFields: [{ name: 'id', tsType: 'string', optional: false }],
              },
              {
                name: 'summarize',
                method: 'POST',
                path: '/ai/summarize',
                operationId: 'summarizeAi',
                inputSchema: 'SummarizeAiInput',
                outputSchema: 'SummarizeAiOutput',
                resolvedInputFields: [{ name: 'text', tsType: 'string', optional: false }],
                resolvedOutputFields: [{ name: 'summary', tsType: 'string', optional: false }],
              },
            ],
          },
        ],
        'ai',
      );

      it('emits a single import line listing all types for this service', () => {
        const importMatches = content.match(/from '\.\.\/types\/services\/ai'/g) ?? [];
        expect(importMatches.length).toBe(1);
        expect(content).toContain(
          "import type { ParseAiInput, ParseAiOutput, SummarizeAiInput, SummarizeAiOutput } from '../types/services/ai';",
        );
      });
    });
  });
});
