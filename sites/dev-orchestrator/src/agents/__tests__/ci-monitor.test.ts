import { describe, expect, it } from 'bun:test';
import { createCiMonitorAgent } from '../ci-monitor';
import type { SandboxClient } from '../../lib/sandbox-client';
import type { GitHubClient } from '../../lib/github-client';

function stubSandbox(): SandboxClient {
  return {
    exec: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
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

describe('Feature: CI Monitor agent', () => {
  describe('Given a ci-monitor agent definition', () => {
    const agent = createCiMonitorAgent(stubSandbox(), stubGitHub());

    it('Then has kind "agent" and name "ci-monitor"', () => {
      expect(agent.kind).toBe('agent');
      expect(agent.name).toBe('ci-monitor');
    });

    it('Then uses MiniMax as the LLM provider', () => {
      expect(agent.model.provider).toBe('minimax');
    });

    it('Then has ghPrChecks, readFile, and gitLog tools', () => {
      const toolNames = Object.keys(agent.tools);
      expect(toolNames).toContain('ghPrChecks');
      expect(toolNames).toContain('readFile');
      expect(toolNames).toContain('gitLog');
    });

    it('Then has a max iterations limit of 10', () => {
      expect(agent.loop.maxIterations).toBe(10);
    });
  });
});
