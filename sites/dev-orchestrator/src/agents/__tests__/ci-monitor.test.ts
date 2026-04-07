import { describe, expect, it } from 'bun:test';
import { ciMonitorAgent } from '../ci-monitor';

describe('Feature: CI Monitor agent', () => {
  describe('Given the ci-monitor agent definition', () => {
    it('Then has kind "agent" and name "ci-monitor"', () => {
      expect(ciMonitorAgent.kind).toBe('agent');
      expect(ciMonitorAgent.name).toBe('ci-monitor');
    });

    it('Then uses MiniMax as the LLM provider', () => {
      expect(ciMonitorAgent.model.provider).toBe('minimax');
    });

    it('Then has ghPrChecks, readFile, and gitLog tools', () => {
      const toolNames = Object.keys(ciMonitorAgent.tools);
      expect(toolNames).toContain('ghPrChecks');
      expect(toolNames).toContain('readFile');
      expect(toolNames).toContain('gitLog');
    });

    it('Then has a max iterations limit of 10', () => {
      expect(ciMonitorAgent.loop.maxIterations).toBe(10);
    });
  });
});
