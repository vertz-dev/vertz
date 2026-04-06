import { describe, expect, it } from 'bun:test';
import { createImplementerAgent } from '../implementer';
import type { SandboxClient } from '../../lib/sandbox-client';

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

describe('Feature: Implementer agent', () => {
  describe('Given an implementer agent definition', () => {
    const agent = createImplementerAgent(stubSandbox());

    it('Then has kind "agent" and name "implementer"', () => {
      expect(agent.kind).toBe('agent');
      expect(agent.name).toBe('implementer');
    });

    it('Then uses MiniMax as the LLM provider', () => {
      expect(agent.model.provider).toBe('minimax');
    });

    it('Then has file, git, and build tools', () => {
      const toolNames = Object.keys(agent.tools);
      expect(toolNames).toContain('readFile');
      expect(toolNames).toContain('writeFile');
      expect(toolNames).toContain('searchCode');
      expect(toolNames).toContain('listFiles');
      expect(toolNames).toContain('runTests');
      expect(toolNames).toContain('runTypecheck');
      expect(toolNames).toContain('runLint');
      expect(toolNames).toContain('gitCommit');
      expect(toolNames).toContain('gitStatus');
      expect(toolNames).toContain('gitPush');
    });

    it('Then has a system prompt emphasizing strict TDD', () => {
      expect(agent.prompt.system).toContain('TDD');
    });

    it('Then has a max iterations limit of 50', () => {
      expect(agent.loop.maxIterations).toBe(50);
    });

    it('Then has a token budget of 100,000', () => {
      expect(agent.loop.tokenBudget?.max).toBe(100_000);
    });
  });
});
