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
    // SDK file + index file
    expect(files).toHaveLength(2);

    const sdkFile = files.find((f) => f.path === 'services/notifications.ts');
    expect(sdkFile).toBeDefined();
    expect(sdkFile!.content).toContain('createNotificationsSdk');
    expect(sdkFile!.content).toContain(
      "import { type FetchClient, createDescriptor } from '@vertz/fetch'",
    );
    expect(sdkFile!.content).toContain('send: Object.assign(');
    expect(sdkFile!.content).toContain('status: Object.assign(');
  });

  it('generates POST action with body parameter', () => {
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
    ]);
    const files = gen.generate(ir, { outputDir: '.', options: {} });
    const sdkFile = files.find((f) => f.path === 'services/notifications.ts')!;
    expect(sdkFile.content).toContain('body: unknown');
    expect(sdkFile.content).toContain('client.post');
  });

  it('generates GET action without body parameter', () => {
    const ir = makeIR([
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
    ]);
    const files = gen.generate(ir, { outputDir: '.', options: {} });
    const sdkFile = files.find((f) => f.path === 'services/notifications.ts')!;
    expect(sdkFile.content).not.toContain('body:');
    expect(sdkFile.content).toContain('client.get');
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
    const ir = makeIR([
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
    ]);
    const files = gen.generate(ir, { outputDir: '.', options: {} });
    const sdkFile = files.find((f) => f.path === 'services/notifications.ts')!;
    expect(sdkFile.content).toContain('notifications/status/:messageId');
  });

  it('interpolates path parameters in generated SDK', () => {
    const ir = makeIR([
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
    ]);
    const files = gen.generate(ir, { outputDir: '.', options: {} });
    const sdkFile = files.find((f) => f.path === 'services/notifications.ts')!;
    // Function should accept messageId as a parameter
    expect(sdkFile.content).toContain('messageId: string');
    // Path should use template literal interpolation
    expect(sdkFile.content).toContain('`/notifications/status/${messageId}`');
    // Static url metadata still uses the raw path pattern
    expect(sdkFile.content).toContain("url: '/notifications/status/:messageId'");
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
    // Only notifications SDK + index
    expect(files).toHaveLength(2);
    expect(files.find((f) => f.path === 'services/empty.ts')).toBeUndefined();
  });
});
