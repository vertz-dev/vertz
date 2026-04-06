import { describe, expect, it } from 'bun:test';
import { createDashboardService } from '../dashboard';

describe('Feature: Dashboard service', () => {
  const agents = [
    { name: 'planner', description: 'Plans features', model: 'MiniMax-M1' },
    { name: 'reviewer', description: 'Reviews code', model: 'MiniMax-M1' },
  ];

  describe('Given a dashboard service with registered agents', () => {
    const svc = createDashboardService(agents);

    it('Then has kind "service" and name "dashboard"', () => {
      expect(svc.kind).toBe('service');
      expect(svc.name).toBe('dashboard');
    });

    it('Then has a listAgents action', () => {
      expect(svc.actions.listAgents).toBeDefined();
      expect(svc.actions.listAgents.method).toBe('GET');
    });

    it('Then listAgents handler returns the registered agents', async () => {
      const result = await svc.actions.listAgents.handler(
        undefined as unknown,
        {} as any,
      );
      expect(result).toEqual({
        agents: [
          { name: 'planner', description: 'Plans features', model: 'MiniMax-M1' },
          { name: 'reviewer', description: 'Reviews code', model: 'MiniMax-M1' },
        ],
      });
    });
  });
});
