import { describe, expect, it } from 'bun:test';
import { createOrchestrator } from '../server';
import type { SandboxClient } from '../lib/sandbox-client';
import type { GitHubClient } from '../lib/github-client';

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

describe('Feature: Server orchestrator setup', () => {
  describe('Given sandbox and GitHub clients', () => {
    const result = createOrchestrator(stubSandbox(), stubGitHub(), { storePath: ':memory:' });

    it('Then returns agents array with 5 agent definitions', () => {
      expect(result.agents).toHaveLength(5);
      const names = result.agents.map((a) => a.name);
      expect(names).toContain('planner');
      expect(names).toContain('reviewer');
      expect(names).toContain('publisher');
      expect(names).toContain('implementer');
      expect(names).toContain('ci-monitor');
    });

    it('Then returns a feature workflow definition', () => {
      expect(result.workflow.kind).toBe('workflow');
      expect(result.workflow.name).toBe('feature');
    });

    it('Then returns an agentRunner function', () => {
      expect(typeof result.agentRunner).toBe('function');
    });
  });
});
