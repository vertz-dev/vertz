import { describe, expect, it } from 'bun:test';
import { publisherAgent } from '../publisher';

describe('Feature: Publisher agent', () => {
  describe('Given the publisher agent definition', () => {
    it('Then has kind "agent" and name "publisher"', () => {
      expect(publisherAgent.kind).toBe('agent');
      expect(publisherAgent.name).toBe('publisher');
    });

    it('Then uses MiniMax as the LLM provider', () => {
      expect(publisherAgent.model.provider).toBe('minimax');
    });

    it('Then has git, github, and sandbox tools for publishing', () => {
      const toolNames = Object.keys(publisherAgent.tools);
      expect(toolNames).toContain('readFile');
      expect(toolNames).toContain('gitCheckoutBranch');
      expect(toolNames).toContain('gitCommit');
      expect(toolNames).toContain('gitPush');
      expect(toolNames).toContain('createPr');
    });

    it('Then has a system prompt referencing branch creation and PR', () => {
      expect(publisherAgent.prompt.system).toContain('branch');
      expect(publisherAgent.prompt.system).toContain('pull request');
    });

    it('Then has a max iterations limit of 15', () => {
      expect(publisherAgent.loop.maxIterations).toBe(15);
    });

    it('Then has a token budget of 20,000', () => {
      expect(publisherAgent.loop.tokenBudget?.max).toBe(20_000);
    });
  });
});
