import type { EntityRouteEntry } from '@vertz/core';
import { enforceAccess } from '../entity/access-enforcer';
import type { AccessRule, BaseContext } from '../entity/types';
import type { AgentLike, AgentRunnerFn } from './types';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface AgentRouteOptions {
  apiPrefix?: string;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Route generator
// ---------------------------------------------------------------------------

/**
 * Generates HTTP route entries for agent invocation.
 *
 * Each agent with an `access.invoke` rule gets a route:
 * `POST /{prefix}/agents/{agentName}/invoke`
 *
 * Agents without an `invoke` access rule get no route (deny by default).
 * Agents with `access.invoke: false` get a 405 handler.
 */
export function generateAgentRoutes(
  agents: readonly AgentLike[],
  runner: AgentRunnerFn,
  options?: AgentRouteOptions,
): EntityRouteEntry[] {
  const prefix = options?.apiPrefix ?? '/api';
  const routes: EntityRouteEntry[] = [];

  for (const agent of agents) {
    const invokeRule = agent.access.invoke;

    // No access rule → deny by default → no route
    if (invokeRule === undefined) continue;

    const routePath = `${prefix}/agents/${agent.name}/invoke`;

    if (invokeRule === false) {
      routes.push({
        method: 'POST',
        path: routePath,
        handler: async () =>
          jsonResponse(
            {
              error: {
                code: 'MethodNotAllowed',
                message: `Agent "${agent.name}" invocation is disabled`,
              },
            },
            405,
          ),
      });
      continue;
    }

    routes.push({
      method: 'POST',
      path: routePath,
      handler: async (ctx) => {
        try {
          // Build context for access evaluation
          const userId = (ctx.userId as string | null | undefined) ?? null;
          const tenantId = (ctx.tenantId as string | null | undefined) ?? null;
          const roles = (ctx.roles as string[] | undefined) ?? [];

          const tenantLevel = (ctx.tenantLevel as string | null | undefined) ?? null;

          const baseCtx: BaseContext = {
            userId,
            tenantId,
            tenantLevel,
            authenticated() {
              return userId !== null;
            },
            tenant() {
              return tenantId !== null;
            },
            role(...rolesToCheck: string[]) {
              return rolesToCheck.some((r) => roles.includes(r));
            },
          };

          // Enforce access rule — cast is safe because users provide rules.* descriptors
          const accessResult = await enforceAccess(
            'invoke',
            agent.access as Partial<Record<string, AccessRule>>,
            baseCtx,
          );
          if (!accessResult.ok) {
            return jsonResponse(
              { error: { code: 'Forbidden', message: accessResult.error.message } },
              403,
            );
          }

          // Validate request body
          const body = ctx.body as Record<string, unknown> | undefined;
          const message = body?.message;
          if (typeof message !== 'string' || message.trim() === '') {
            return jsonResponse(
              {
                error: {
                  code: 'BadRequest',
                  message: 'Request body must include a "message" string field',
                },
              },
              400,
            );
          }

          // Extract optional sessionId
          const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : undefined;

          // Execute agent
          const result = await runner(agent.name, { message, sessionId }, baseCtx);

          return jsonResponse(result);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Internal server error';
          return jsonResponse(
            { error: { code: 'InternalServerError', message: errorMessage } },
            500,
          );
        }
      },
    });
  }

  return routes;
}
