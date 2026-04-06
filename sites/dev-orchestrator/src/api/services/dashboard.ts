import { service, rules } from '@vertz/server';
import { s } from '@vertz/schema';

export interface AgentInfo {
  readonly name: string;
  readonly description: string;
  readonly model: string;
}

export function createDashboardService(agents: readonly AgentInfo[]) {
  return service('dashboard', {
    access: {
      listAgents: rules.public,
    },
    actions: {
      listAgents: {
        method: 'GET',
        response: s.object({
          agents: s.array(s.object({
            name: s.string(),
            description: s.string(),
            model: s.string(),
          })),
        }),
        async handler() {
          return { agents: [...agents] };
        },
      },
    },
  });
}
