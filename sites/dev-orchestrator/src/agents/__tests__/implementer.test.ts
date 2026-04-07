import { describe, expect, it } from 'bun:test';
import { implementerAgent } from '../implementer';

describe('Feature: Implementer agent', () => {
  describe('Given the implementer agent definition', () => {
    it('Then has kind "agent" and name "implementer"', () => {
      expect(implementerAgent.kind).toBe('agent');
      expect(implementerAgent.name).toBe('implementer');
    });

    it('Then uses MiniMax as the LLM provider', () => {
      expect(implementerAgent.model.provider).toBe('minimax');
    });

    it('Then has file, git, and build tools', () => {
      const toolNames = Object.keys(implementerAgent.tools);
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
      expect(implementerAgent.prompt.system).toContain('TDD');
    });

    it('Then has a max iterations limit of 50', () => {
      expect(implementerAgent.loop.maxIterations).toBe(50);
    });

    it('Then has a token budget of 100,000', () => {
      expect(implementerAgent.loop.tokenBudget?.max).toBe(100_000);
    });
  });
});
