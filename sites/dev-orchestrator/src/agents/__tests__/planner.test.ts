import { describe, expect, it } from 'bun:test';
import { plannerAgent } from '../planner';

describe('Feature: Planner agent', () => {
  describe('Given the planner agent definition', () => {
    it('Then has kind "agent" and name "planner"', () => {
      expect(plannerAgent.kind).toBe('agent');
      expect(plannerAgent.name).toBe('planner');
    });

    it('Then uses MiniMax as the LLM provider', () => {
      expect(plannerAgent.model.provider).toBe('minimax');
    });

    it('Then has readIssue, readFile, writeFile, searchCode, and listFiles tools', () => {
      const toolNames = Object.keys(plannerAgent.tools);
      expect(toolNames).toContain('readIssue');
      expect(toolNames).toContain('readFile');
      expect(toolNames).toContain('writeFile');
      expect(toolNames).toContain('searchCode');
      expect(toolNames).toContain('listFiles');
    });

    it('Then has a system prompt referencing design doc conventions', () => {
      expect(plannerAgent.prompt.system).toContain('design doc');
    });

    it('Then has a max iterations limit of 30', () => {
      expect(plannerAgent.loop.maxIterations).toBe(30);
    });

    it('Then has a token budget of 50,000', () => {
      expect(plannerAgent.loop.tokenBudget?.max).toBe(50_000);
    });
  });
});
