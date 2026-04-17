import { describe, expect, it } from '@vertz/test';
import { Project, SyntaxKind } from 'ts-morph';
import { resolveConfig } from '../../config';
import type { InjectRef, ServiceActionIR, ServiceIR } from '../../ir/types';
import { parseInjectRefs, ServiceAnalyzer } from '../service-analyzer';

function createProject() {
  return new Project({ useInMemoryFileSystem: true });
}

describe('ServiceAnalyzer', () => {
  describe('standalone service() discovery', () => {
    it('discovers standalone service() call imported from @vertz/server', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/notifications.service.ts',
        `import { service, action } from '@vertz/server';
import { s } from '@vertz/schema';

const sendBody = s.object({ to: s.string() });
const sendResponse = s.object({ ok: s.boolean() });

export const notifications = service('notifications', {
  access: { send: () => true },
  actions: {
    send: action({
      body: sendBody,
      response: sendResponse,
      handler: async (input, ctx) => ({ ok: true }),
    }),
  },
});`,
      );
      const analyzer = new ServiceAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();
      expect(result.services).toHaveLength(1);
      expect(result.services[0].name).toBe('notifications');
    });

    it('extracts service name from first string argument, not variable name', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/my-service.ts',
        `import { service, action } from '@vertz/server';
import { s } from '@vertz/schema';

export const myVar = service('email-sender', {
  access: { send: () => true },
  actions: {
    send: action({
      response: s.object({ ok: s.boolean() }),
      handler: async () => ({ ok: true }),
    }),
  },
});`,
      );
      const analyzer = new ServiceAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();
      expect(result.services[0].name).toBe('email-sender');
    });

    it('discovers multiple services across files', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/a.ts',
        `import { service, action } from '@vertz/server';
import { s } from '@vertz/schema';
export const a = service('svc-a', {
  access: { ping: () => true },
  actions: { ping: action({ response: s.object({ ok: s.boolean() }), handler: async () => ({ ok: true }) }) },
});`,
      );
      project.createSourceFile(
        'src/b.ts',
        `import { service, action } from '@vertz/server';
import { s } from '@vertz/schema';
export const b = service('svc-b', {
  access: { pong: () => true },
  actions: { pong: action({ response: s.object({ ok: s.boolean() }), handler: async () => ({ ok: true }) }) },
});`,
      );
      const analyzer = new ServiceAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();
      expect(result.services).toHaveLength(2);
      const names = result.services.map((s) => s.name).sort();
      expect(names).toEqual(['svc-a', 'svc-b']);
    });

    it('extracts source location', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/notifications.service.ts',
        `import { service, action } from '@vertz/server';
import { s } from '@vertz/schema';

export const notifications = service('notifications', {
  access: { send: () => true },
  actions: {
    send: action({ response: s.object({ ok: s.boolean() }), handler: async () => ({ ok: true }) }),
  },
});`,
      );
      const analyzer = new ServiceAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();
      expect(result.services[0].sourceFile).toContain('notifications.service.ts');
      expect(result.services[0].sourceLine).toBe(4);
    });

    it('ignores service() calls not imported from @vertz/server', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/other.ts',
        `function service(name: string, config: any) { return config; }
const svc = service('fake', { actions: {} });`,
      );
      const analyzer = new ServiceAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();
      expect(result.services).toHaveLength(0);
    });

    it('emits diagnostic for duplicate service names', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/a.ts',
        `import { service, action } from '@vertz/server';
import { s } from '@vertz/schema';
export const a = service('notifications', {
  access: { send: () => true },
  actions: { send: action({ response: s.object({ ok: s.boolean() }), handler: async () => ({ ok: true }) }) },
});`,
      );
      project.createSourceFile(
        'src/b.ts',
        `import { service, action } from '@vertz/server';
import { s } from '@vertz/schema';
export const b = service('notifications', {
  access: { check: () => true },
  actions: { check: action({ response: s.object({ ok: s.boolean() }), handler: async () => ({ ok: true }) }) },
});`,
      );
      const analyzer = new ServiceAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();
      expect(result.services).toHaveLength(1);
      const diags = analyzer.getDiagnostics();
      expect(diags).toHaveLength(1);
      expect(diags[0].code).toBe('VERTZ_SERVICE_DUPLICATE_NAME');
    });

    it('ignores action() calls not imported from @vertz/server', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/svc.ts',
        `import { service } from '@vertz/server';
function action(config: any) { return config; }
export const svc = service('my-svc', {
  access: {},
  actions: { send: action({ handler: async () => ({}) }) },
});`,
      );
      const analyzer = new ServiceAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();
      expect(result.services[0].actions).toHaveLength(0);
    });
  });

  describe('action parsing', () => {
    it('extracts action names from actions config', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/svc.ts',
        `import { service, action } from '@vertz/server';
import { s } from '@vertz/schema';
export const svc = service('my-svc', {
  access: { send: () => true, check: () => true },
  actions: {
    send: action({ body: s.object({ to: s.string() }), response: s.object({ ok: s.boolean() }), handler: async () => ({ ok: true }) }),
    check: action({ method: 'GET', response: s.object({ status: s.string() }), handler: async () => ({ status: 'ok' }) }),
  },
});`,
      );
      const analyzer = new ServiceAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();
      expect(result.services[0].actions).toHaveLength(2);
      expect(result.services[0].actions.map((a) => a.name).sort()).toEqual(['check', 'send']);
    });

    it('extracts method defaulting to POST when not specified', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/svc.ts',
        `import { service, action } from '@vertz/server';
import { s } from '@vertz/schema';
export const svc = service('my-svc', {
  access: { send: () => true },
  actions: {
    send: action({ response: s.object({ ok: s.boolean() }), handler: async () => ({ ok: true }) }),
  },
});`,
      );
      const analyzer = new ServiceAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();
      expect(result.services[0].actions[0].method).toBe('POST');
    });

    it('extracts explicit method override', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/svc.ts',
        `import { service, action } from '@vertz/server';
import { s } from '@vertz/schema';
export const svc = service('my-svc', {
  access: { check: () => true },
  actions: {
    check: action({ method: 'GET', response: s.object({ ok: s.boolean() }), handler: async () => ({ ok: true }) }),
  },
});`,
      );
      const analyzer = new ServiceAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();
      expect(result.services[0].actions[0].method).toBe('GET');
    });

    it('extracts custom path from action', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/svc.ts',
        `import { service, action } from '@vertz/server';
import { s } from '@vertz/schema';
export const svc = service('my-svc', {
  access: { status: () => true },
  actions: {
    status: action({ method: 'GET', path: 'notifications/status/:messageId', response: s.object({ ok: s.boolean() }), handler: async () => ({ ok: true }) }),
  },
});`,
      );
      const analyzer = new ServiceAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();
      expect(result.services[0].actions[0].path).toBe('notifications/status/:messageId');
    });
  });

  describe('Feature: service-analyzer extracts action schemas', () => {
    describe('Given action({ body, response, handler }) referencing SchemaLike<T> constants', () => {
      it('Then ServiceActionIR.body is inline with resolvedFields mirroring the T shape', async () => {
        const project = createProject();
        project.createSourceFile(
          'src/svc.ts',
          `import { service, action } from '@vertz/server';
export interface SchemaLike<T> { parse(data: unknown): { ok: true; data: T } | { ok: false; error: Error }; }
export const sendBody: SchemaLike<{ to: string; subject: string }> = {} as SchemaLike<{ to: string; subject: string }>;
export const sendResponse: SchemaLike<{ ok: boolean }> = {} as SchemaLike<{ ok: boolean }>;
export const notifications = service('notifications', {
  access: { send: () => true },
  actions: {
    send: action({ body: sendBody, response: sendResponse, handler: async () => ({ ok: true }) }),
  },
});`,
        );
        const analyzer = new ServiceAnalyzer(project, resolveConfig());
        const result = await analyzer.analyze();
        const send = result.services[0]?.actions[0];
        expect(send?.body?.kind).toBe('inline');
        if (send?.body?.kind === 'inline') {
          expect(send.body.resolvedFields).toEqual(
            expect.arrayContaining([
              { name: 'to', tsType: 'string', optional: false },
              { name: 'subject', tsType: 'string', optional: false },
            ]),
          );
        }
      });

      it('Then ServiceActionIR.response is inline with resolvedFields mirroring the T shape', async () => {
        const project = createProject();
        project.createSourceFile(
          'src/svc.ts',
          `import { service, action } from '@vertz/server';
export interface SchemaLike<T> { parse(data: unknown): { ok: true; data: T } | { ok: false; error: Error }; }
export const sendBody: SchemaLike<{ to: string }> = {} as SchemaLike<{ to: string }>;
export const sendResponse: SchemaLike<{ ok: boolean; count?: number }> = {} as SchemaLike<{ ok: boolean; count?: number }>;
export const notifications = service('notifications', {
  access: { send: () => true },
  actions: {
    send: action({ body: sendBody, response: sendResponse, handler: async () => ({ ok: true }) }),
  },
});`,
        );
        const analyzer = new ServiceAnalyzer(project, resolveConfig());
        const result = await analyzer.analyze();
        const send = result.services[0]?.actions[0];
        expect(send?.response?.kind).toBe('inline');
        if (send?.response?.kind === 'inline') {
          expect(send.response.resolvedFields).toEqual(
            expect.arrayContaining([
              { name: 'ok', tsType: 'boolean', optional: false },
              { name: 'count', tsType: 'number', optional: true },
            ]),
          );
        }
      });
    });

    describe('Given a GET action with only response (no body)', () => {
      it('Then body is undefined and response is resolved', async () => {
        const project = createProject();
        project.createSourceFile(
          'src/svc.ts',
          `import { service, action } from '@vertz/server';
export interface SchemaLike<T> { parse(data: unknown): { ok: true; data: T } | { ok: false; error: Error }; }
export const statusResponse: SchemaLike<{ status: string }> = {} as SchemaLike<{ status: string }>;
export const svc = service('my-svc', {
  access: { status: () => true },
  actions: {
    status: action({ method: 'GET', response: statusResponse, handler: async () => ({ status: 'ok' }) }),
  },
});`,
        );
        const analyzer = new ServiceAnalyzer(project, resolveConfig());
        const result = await analyzer.analyze();
        const status = result.services[0]?.actions[0];
        expect(status?.body).toBeUndefined();
        expect(status?.response?.kind).toBe('inline');
      });

      it('Then no SERVICE_ACTION_MISSING_SCHEMA diagnostic is emitted when response is present', async () => {
        const project = createProject();
        project.createSourceFile(
          'src/svc.ts',
          `import { service, action } from '@vertz/server';
export interface SchemaLike<T> { parse(data: unknown): { ok: true; data: T } | { ok: false; error: Error }; }
export const statusResponse: SchemaLike<{ status: string }> = {} as SchemaLike<{ status: string }>;
export const svc = service('my-svc', {
  access: { status: () => true },
  actions: {
    status: action({ method: 'GET', response: statusResponse, handler: async () => ({ status: 'ok' }) }),
  },
});`,
        );
        const analyzer = new ServiceAnalyzer(project, resolveConfig());
        await analyzer.analyze();
        const diags = analyzer.getDiagnostics();
        expect(diags.find((d) => d.code === 'SERVICE_ACTION_MISSING_SCHEMA')).toBeUndefined();
      });
    });

    describe('Given an action with no body and no response', () => {
      it('Then body and response are both undefined', async () => {
        const project = createProject();
        project.createSourceFile(
          'src/svc.ts',
          `import { service, action } from '@vertz/server';
export const svc = service('my-svc', {
  access: { bare: () => true },
  actions: {
    bare: action({ handler: async () => ({}) }),
  },
});`,
        );
        const analyzer = new ServiceAnalyzer(project, resolveConfig());
        const result = await analyzer.analyze();
        const bare = result.services[0]?.actions[0];
        expect(bare?.body).toBeUndefined();
        expect(bare?.response).toBeUndefined();
      });

      it('Then a SERVICE_ACTION_MISSING_SCHEMA warning is added', async () => {
        const project = createProject();
        project.createSourceFile(
          'src/svc.ts',
          `import { service, action } from '@vertz/server';
export const svc = service('my-svc', {
  access: { bare: () => true },
  actions: {
    bare: action({ handler: async () => ({}) }),
  },
});`,
        );
        const analyzer = new ServiceAnalyzer(project, resolveConfig());
        await analyzer.analyze();
        const diags = analyzer.getDiagnostics();
        const missing = diags.find((d) => d.code === 'SERVICE_ACTION_MISSING_SCHEMA');
        expect(missing).toBeDefined();
        expect(missing?.severity).toBe('warning');
      });
    });

    describe('Given an action whose body references an unresolvable expression', () => {
      it('Then body is inline with resolvedFields undefined', async () => {
        const project = createProject();
        project.createSourceFile(
          'src/svc.ts',
          `import { service, action } from '@vertz/server';
const mystery: unknown = {};
export const svc = service('my-svc', {
  access: { weird: () => true },
  actions: {
    weird: action({ body: mystery as any, handler: async () => ({}) }),
  },
});`,
        );
        const analyzer = new ServiceAnalyzer(project, resolveConfig());
        const result = await analyzer.analyze();
        const weird = result.services[0]?.actions[0];
        expect(weird?.body?.kind).toBe('inline');
        if (weird?.body?.kind === 'inline') {
          expect(weird.body.resolvedFields).toBeUndefined();
        }
      });
    });
  });

  describe('access rule parsing', () => {
    it('extracts access rules per action', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/svc.ts',
        `import { service, action } from '@vertz/server';
import { s } from '@vertz/schema';
export const svc = service('my-svc', {
  access: { send: () => true, check: false },
  actions: {
    send: action({ response: s.object({ ok: s.boolean() }), handler: async () => ({ ok: true }) }),
    check: action({ response: s.object({ ok: s.boolean() }), handler: async () => ({ ok: true }) }),
  },
});`,
      );
      const analyzer = new ServiceAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();
      expect(result.services[0].access.send).toBe('function');
      expect(result.services[0].access.check).toBe('false');
    });

    it('marks missing access rules as none', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/svc.ts',
        `import { service, action } from '@vertz/server';
import { s } from '@vertz/schema';
export const svc = service('my-svc', {
  access: { send: () => true },
  actions: {
    send: action({ response: s.object({ ok: s.boolean() }), handler: async () => ({ ok: true }) }),
    check: action({ response: s.object({ ok: s.boolean() }), handler: async () => ({ ok: true }) }),
  },
});`,
      );
      const analyzer = new ServiceAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();
      expect(result.services[0].access.send).toBe('function');
      expect(result.services[0].access.check).toBe('none');
    });

    it('defaults to empty access when access property is missing', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/svc.ts',
        `import { service, action } from '@vertz/server';
import { s } from '@vertz/schema';
export const svc = service('my-svc', {
  actions: {
    send: action({ response: s.object({ ok: s.boolean() }), handler: async () => ({ ok: true }) }),
  },
});`,
      );
      const analyzer = new ServiceAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();
      expect(result.services[0].access.send).toBe('none');
    });
  });

  describe('inject parsing', () => {
    it('extracts inject references with shorthand', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/svc.ts',
        `import { service, action } from '@vertz/server';
import { s } from '@vertz/schema';
const todos = {};
export const svc = service('my-svc', {
  inject: { todos },
  access: { sync: () => true },
  actions: {
    sync: action({ response: s.object({ ok: s.boolean() }), handler: async () => ({ ok: true }) }),
  },
});`,
      );
      const analyzer = new ServiceAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();
      expect(result.services[0].inject).toHaveLength(1);
      expect(result.services[0].inject[0]).toEqual({ localName: 'todos', resolvedToken: 'todos' });
    });

    it('empty inject when not specified', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/svc.ts',
        `import { service, action } from '@vertz/server';
import { s } from '@vertz/schema';
export const svc = service('my-svc', {
  access: { send: () => true },
  actions: {
    send: action({ response: s.object({ ok: s.boolean() }), handler: async () => ({ ok: true }) }),
  },
});`,
      );
      const analyzer = new ServiceAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();
      expect(result.services[0].inject).toEqual([]);
    });
  });
});

describe('parseInjectRefs', () => {
  it('parses shorthand inject properties', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `const dbService = {}; const obj = { dbService };`,
    );
    const decl = file.getVariableDeclarationOrThrow('obj');
    const obj = decl.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    expect(parseInjectRefs(obj)).toEqual([{ localName: 'dbService', resolvedToken: 'dbService' }]);
  });

  it('parses explicit inject properties', () => {
    const project = createProject();
    const file = project.createSourceFile(
      'test.ts',
      `const dbService = {}; const obj = { db: dbService };`,
    );
    const decl = file.getVariableDeclarationOrThrow('obj');
    const obj = decl.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    expect(parseInjectRefs(obj)).toEqual([{ localName: 'db', resolvedToken: 'dbService' }]);
  });

  it('returns empty array for empty object', () => {
    const project = createProject();
    const file = project.createSourceFile('test.ts', `const obj = {};`);
    const decl = file.getVariableDeclarationOrThrow('obj');
    const obj = decl.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    expect(parseInjectRefs(obj)).toEqual([]);
  });
});

describe('type-level tests', () => {
  it('ServiceIR requires name, actions, and access', () => {
    // @ts-expect-error — ServiceIR without 'access' should be rejected
    const bad: ServiceIR = {
      name: 'svc',
      sourceFile: 'test.ts',
      sourceLine: 1,
      sourceColumn: 0,
      inject: [],
      actions: [],
    };
    expect(bad).toBeDefined();
  });

  it('ServiceActionIR requires name and method', () => {
    // @ts-expect-error — ServiceActionIR without 'method' should be rejected
    const bad: ServiceActionIR = { name: 'send' };
    expect(bad).toBeDefined();
  });

  it('InjectRef requires both localName and resolvedToken', () => {
    // @ts-expect-error — InjectRef without 'resolvedToken' should be rejected
    const bad: InjectRef = { localName: 'db' };
    expect(bad).toBeDefined();
  });
});
