import { describe, expect, it } from 'bun:test';
import { createPlannerAgent } from '../planner';
import type { SandboxClient } from '../../lib/sandbox-client';
import type { GitHubClient } from '../../lib/github-client';

function stubSandbox(): SandboxClient {
  const noop = async () => ({ stdout: '', stderr: '', exitCode: 0 });
  return {
    exec: noop as any,
    readFile: async () => '',
    writeFile: async () => {},
    searchFiles: async () => [],
    listFiles: async () => [],
    destroy: async () => {},
  };
}

function stubGitHub(): GitHubClient {
  return {
    getIssue: async () => ({ title: '', body: '', labels: [] }),
    getPrChecks: async () => ({ status: 'success' as const, checks: [] }),
    createPr: async () => ({ number: 1, url: '' }),
    commentOnIssue: async () => ({ commentId: 1 }),
  };
}

describe('Feature: Planner agent', () => {
  describe('Given a planner agent definition', () => {
    const agent = createPlannerAgent(stubSandbox(), stubGitHub());

    it('Then has kind "agent" and name "planner"', () => {
      expect(agent.kind).toBe('agent');
      expect(agent.name).toBe('planner');
    });

    it('Then uses MiniMax as the LLM provider', () => {
      expect(agent.model.provider).toBe('minimax');
    });

    it('Then has readIssue, readFile, writeFile, searchCode, and listFiles tools', () => {
      const toolNames = Object.keys(agent.tools);
      expect(toolNames).toContain('readIssue');
      expect(toolNames).toContain('readFile');
      expect(toolNames).toContain('writeFile');
      expect(toolNames).toContain('searchCode');
      expect(toolNames).toContain('listFiles');
    });

    it('Then has a system prompt referencing design doc conventions', () => {
      expect(agent.prompt.system).toContain('design doc');
    });

    it('Then has a max iterations limit of 30', () => {
      expect(agent.loop.maxIterations).toBe(30);
    });

    it('Then has a token budget of 50,000', () => {
      expect(agent.loop.tokenBudget?.max).toBe(50_000);
    });
  });
});
