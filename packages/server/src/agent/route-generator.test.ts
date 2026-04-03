import { describe, expect, it, mock } from 'bun:test';
import { rules } from '../auth/rules';
import { generateAgentRoutes } from './route-generator';
import type { AgentLike, AgentRunnerFn } from './types';

// Minimal error stubs matching the code property used by isSessionError()
class SessionNotFoundError extends Error {
  readonly code = 'SESSION_NOT_FOUND' as const;
  constructor(sessionId: string) {
    super(`Session not found or access denied: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}
class SessionAccessDeniedError extends Error {
  readonly code = 'SESSION_ACCESS_DENIED' as const;
  constructor(sessionId: string) {
    super(`Session not found or access denied: ${sessionId}`);
    this.name = 'SessionAccessDeniedError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<AgentLike> = {}): AgentLike {
  return {
    kind: 'agent',
    name: 'test-agent',
    access: {},
    ...overrides,
  };
}

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    roles: [],
    body: { message: 'Hello' },
    ...overrides,
  };
}

const okRunner: AgentRunnerFn = mock(async () => ({
  status: 'complete',
  response: 'Done.',
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateAgentRoutes()', () => {
  describe('Given an agent with access.invoke set to rules.authenticated()', () => {
    describe('When routes are generated', () => {
      it('Then creates a POST route at /api/agents/:name/invoke', () => {
        const agent = makeAgent({ access: { invoke: rules.authenticated() } });
        const routes = generateAgentRoutes([agent], okRunner);

        expect(routes).toHaveLength(1);
        expect(routes[0].method).toBe('POST');
        expect(routes[0].path).toBe('/api/agents/test-agent/invoke');
      });
    });
  });

  describe('Given an authenticated user invokes an agent', () => {
    describe('When the route handler is called', () => {
      it('Then calls the runner and returns the result as JSON', async () => {
        const agent = makeAgent({ access: { invoke: rules.authenticated() } });
        const runner: AgentRunnerFn = mock(async () => ({
          status: 'complete',
          response: 'The answer is 42.',
        }));
        const routes = generateAgentRoutes([agent], runner);
        const handler = routes[0].handler;

        const response = (await handler(makeCtx())) as Response;

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.status).toBe('complete');
        expect(body.response).toBe('The answer is 42.');

        expect(runner).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Given an unauthenticated user invokes an agent with authenticated() access', () => {
    describe('When the route handler is called', () => {
      it('Then returns 403 Forbidden', async () => {
        const agent = makeAgent({ access: { invoke: rules.authenticated() } });
        const routes = generateAgentRoutes([agent], okRunner);
        const handler = routes[0].handler;

        const response = (await handler(makeCtx({ userId: null }))) as Response;

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.error.code).toBe('Forbidden');
      });
    });
  });

  describe('Given an agent with no access rule for invoke', () => {
    describe('When routes are generated', () => {
      it('Then no route is generated (deny by default)', () => {
        const agent = makeAgent({ access: {} });
        const routes = generateAgentRoutes([agent], okRunner);

        expect(routes).toHaveLength(0);
      });
    });
  });

  describe('Given an agent with access.invoke set to false', () => {
    describe('When routes are generated', () => {
      it('Then generates a 405 route', async () => {
        const agent = makeAgent({ access: { invoke: false } });
        const routes = generateAgentRoutes([agent], okRunner);

        expect(routes).toHaveLength(1);
        const response = (await routes[0].handler(makeCtx())) as Response;
        expect(response.status).toBe(405);
      });
    });
  });

  describe('Given a request body without a message field', () => {
    describe('When the route handler is called', () => {
      it('Then returns 400 Bad Request', async () => {
        const agent = makeAgent({ access: { invoke: rules.public } });
        const routes = generateAgentRoutes([agent], okRunner);
        const handler = routes[0].handler;

        const response = (await handler(makeCtx({ body: {} }))) as Response;

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error.code).toBe('BadRequest');
      });
    });
  });

  describe('Given a custom apiPrefix', () => {
    describe('When routes are generated', () => {
      it('Then uses the custom prefix in the route path', () => {
        const agent = makeAgent({ access: { invoke: rules.public } });
        const routes = generateAgentRoutes([agent], okRunner, { apiPrefix: '/v2' });

        expect(routes[0].path).toBe('/v2/agents/test-agent/invoke');
      });
    });
  });

  describe('Given multiple agents', () => {
    describe('When routes are generated', () => {
      it('Then creates a route for each agent with an invoke access rule', () => {
        const agents = [
          makeAgent({ name: 'agent-a', access: { invoke: rules.public } }),
          makeAgent({ name: 'agent-b', access: { invoke: rules.authenticated() } }),
          makeAgent({ name: 'agent-c', access: {} }),
        ];
        const routes = generateAgentRoutes(agents, okRunner);

        expect(routes).toHaveLength(2);
        expect(routes[0].path).toBe('/api/agents/agent-a/invoke');
        expect(routes[1].path).toBe('/api/agents/agent-b/invoke');
      });
    });
  });

  describe('Given the runner throws SessionNotFoundError', () => {
    describe('When the route handler is called', () => {
      it('Then returns 404 (not 500) to indicate invalid session', async () => {
        const agent = makeAgent({ access: { invoke: rules.public } });
        const runner: AgentRunnerFn = async () => {
          throw new SessionNotFoundError('sess_missing');
        };
        const routes = generateAgentRoutes([agent], runner);
        const handler = routes[0].handler;

        const response = (await handler(makeCtx())) as Response;

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error.code).toBe('NotFound');
        expect(body.error.message).toContain('not found or access denied');
      });
    });
  });

  describe('Given the runner throws SessionAccessDeniedError', () => {
    describe('When the route handler is called', () => {
      it('Then returns 404 (unified with not-found for enumeration prevention)', async () => {
        const agent = makeAgent({ access: { invoke: rules.public } });
        const runner: AgentRunnerFn = async () => {
          throw new SessionAccessDeniedError('sess_other-user');
        };
        const routes = generateAgentRoutes([agent], runner);
        const handler = routes[0].handler;

        const response = (await handler(makeCtx())) as Response;

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error.code).toBe('NotFound');
        expect(body.error.message).toContain('not found or access denied');
      });
    });
  });

  describe('Given the runner throws a generic error', () => {
    describe('When the route handler is called without devMode', () => {
      it('Then returns 500 with a generic error message', async () => {
        const agent = makeAgent({ access: { invoke: rules.public } });
        const failingRunner: AgentRunnerFn = async () => {
          throw new Error('LLM provider failed');
        };
        const routes = generateAgentRoutes([agent], failingRunner);
        const handler = routes[0].handler;

        const response = (await handler(makeCtx())) as Response;

        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.error.code).toBe('InternalError');
        expect(body.error.message).toBe('An unexpected error occurred');
        expect(body.error.stack).toBeUndefined();
      });
    });

    describe('When devMode is true', () => {
      it('Then returns 500 with the real error message and stack', async () => {
        const agent = makeAgent({ access: { invoke: rules.public } });
        const failingRunner: AgentRunnerFn = async () => {
          throw new Error('LLM provider failed');
        };
        const routes = generateAgentRoutes([agent], failingRunner, { devMode: true });
        const handler = routes[0].handler;

        const response = (await handler(makeCtx())) as Response;

        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.error.code).toBe('InternalError');
        expect(body.error.message).toBe('LLM provider failed');
        expect(body.error.stack).toBeDefined();
      });
    });

    describe('When a SessionError is thrown with devMode true', () => {
      it('Then still returns 404 regardless of devMode', async () => {
        const agent = makeAgent({ access: { invoke: rules.public } });
        const failingRunner: AgentRunnerFn = async () => {
          throw new SessionNotFoundError('sess_missing');
        };
        const routes = generateAgentRoutes([agent], failingRunner, { devMode: true });
        const handler = routes[0].handler;

        const response = (await handler(makeCtx())) as Response;

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error.code).toBe('NotFound');
      });
    });
  });

  describe('Given an agent with rules.public access', () => {
    describe('When an unauthenticated user invokes it', () => {
      it('Then allows access and calls the runner', async () => {
        const agent = makeAgent({ access: { invoke: rules.public } });
        const runner: AgentRunnerFn = mock(async () => ({
          status: 'complete',
          response: 'Public agent response',
        }));
        const routes = generateAgentRoutes([agent], runner);
        const handler = routes[0].handler;

        const response = (await handler(makeCtx({ userId: null }))) as Response;

        expect(response.status).toBe(200);
        expect(runner).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Session ID passthrough
  // ---------------------------------------------------------------------------

  describe('Given a request body with sessionId', () => {
    describe('When the route handler is called', () => {
      it('Then passes sessionId to the runner as part of options bag', async () => {
        const agent = makeAgent({ access: { invoke: rules.public } });
        let capturedOptions: { message: string; sessionId?: string } | undefined;
        const runner: AgentRunnerFn = mock(async (_name, opts) => {
          capturedOptions = opts;
          return { status: 'complete', response: 'ok', sessionId: 'sess_abc' };
        });
        const routes = generateAgentRoutes([agent], runner);
        const handler = routes[0].handler;

        const response = (await handler(
          makeCtx({ body: { message: 'Hello', sessionId: 'sess_abc' } }),
        )) as Response;

        expect(response.status).toBe(200);
        expect(capturedOptions!.message).toBe('Hello');
        expect(capturedOptions!.sessionId).toBe('sess_abc');
      });
    });
  });

  describe('Given a runner that returns sessionId', () => {
    describe('When the route handler returns the result', () => {
      it('Then includes sessionId in the response body', async () => {
        const agent = makeAgent({ access: { invoke: rules.public } });
        const runner: AgentRunnerFn = mock(async () => ({
          status: 'complete',
          response: 'ok',
          sessionId: 'sess_new-123',
        }));
        const routes = generateAgentRoutes([agent], runner);
        const handler = routes[0].handler;

        const response = (await handler(makeCtx())) as Response;
        const body = await response.json();

        expect(body.sessionId).toBe('sess_new-123');
      });
    });
  });
});
