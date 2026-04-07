import { describe, expect, it } from 'bun:test';
import { reviewerAgent } from '../reviewer';

describe('Feature: Reviewer agent', () => {
  describe('Given the reviewer agent definition', () => {
    it('Then has kind "agent" and name "reviewer"', () => {
      expect(reviewerAgent.kind).toBe('agent');
      expect(reviewerAgent.name).toBe('reviewer');
    });

    it('Then uses MiniMax as the LLM provider', () => {
      expect(reviewerAgent.model.provider).toBe('minimax');
    });

    it('Then has readFile, searchCode, listFiles, and writeFile tools', () => {
      const toolNames = Object.keys(reviewerAgent.tools);
      expect(toolNames).toContain('readFile');
      expect(toolNames).toContain('searchCode');
      expect(toolNames).toContain('listFiles');
      expect(toolNames).toContain('writeFile');
    });

    it('Then has a system prompt emphasizing adversarial review', () => {
      expect(reviewerAgent.prompt.system).toContain('adversarial');
    });

    it('Then has a max iterations limit of 30', () => {
      expect(reviewerAgent.loop.maxIterations).toBe(30);
    });
  });
});
