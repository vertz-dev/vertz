import { describe, expect, it } from 'bun:test';
import { createReviewerAgent } from '../reviewer';
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

describe('Feature: Reviewer agent', () => {
  describe('Given a reviewer agent definition', () => {
    const agent = createReviewerAgent(stubSandbox());

    it('Then has kind "agent" and name "reviewer"', () => {
      expect(agent.kind).toBe('agent');
      expect(agent.name).toBe('reviewer');
    });

    it('Then uses MiniMax as the LLM provider', () => {
      expect(agent.model.provider).toBe('minimax');
    });

    it('Then has readFile, searchCode, listFiles, and writeFile tools', () => {
      const toolNames = Object.keys(agent.tools);
      expect(toolNames).toContain('readFile');
      expect(toolNames).toContain('searchCode');
      expect(toolNames).toContain('listFiles');
      expect(toolNames).toContain('writeFile');
    });

    it('Then has a system prompt emphasizing adversarial review', () => {
      expect(agent.prompt.system).toContain('adversarial');
    });

    it('Then has a max iterations limit of 20', () => {
      expect(agent.loop.maxIterations).toBe(20);
    });
  });
});
