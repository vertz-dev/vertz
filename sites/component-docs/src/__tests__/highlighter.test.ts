import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  __resetHighlighter,
  getHighlighterPromise,
  highlightCode,
  initHighlighter,
  isHighlighterReady,
} from '../lib/highlighter';

describe('highlighter', () => {
  describe('Given the highlighter has not been initialized', () => {
    beforeAll(() => {
      __resetHighlighter();
    });

    afterAll(async () => {
      // Re-initialize for subsequent test suites that depend on it
      await initHighlighter();
    });

    it('isHighlighterReady() returns false', () => {
      expect(isHighlighterReady()).toBe(false);
    });

    it('highlightCode() returns null when not initialized', () => {
      expect(highlightCode('const x = 1;', 'ts')).toBeNull();
    });
  });

  describe('Given the highlighter is initialized', () => {
    beforeAll(async () => {
      await initHighlighter();
    });

    it('isHighlighterReady() returns true after initialization', () => {
      expect(isHighlighterReady()).toBe(true);
    });

    it('getHighlighterPromise() returns a resolved promise', async () => {
      const promise = getHighlighterPromise();
      expect(promise).toBeInstanceOf(Promise);
      await expect(promise).resolves.toBeDefined();
    });

    it('multiple initHighlighter() calls reuse the singleton', async () => {
      const promise1 = getHighlighterPromise();
      await initHighlighter();
      const promise2 = getHighlighterPromise();
      expect(promise1).toBe(promise2);
    });

    it('highlightCode() returns HTML with shiki class for TypeScript', () => {
      const html = highlightCode('const x = 1;', 'ts');
      expect(html).not.toBeNull();
      expect(html).toContain('shiki');
      expect(html).toContain('<pre');
      expect(html).toContain('<code');
    });

    it('highlightCode() returns HTML containing the source code text', () => {
      const html = highlightCode('const greeting = "hello";', 'ts');
      expect(html).toContain('const');
      expect(html).toContain('greeting');
      expect(html).toContain('hello');
    });

    it('highlightCode() produces colored spans for syntax tokens', () => {
      const html = highlightCode('const x = 1;', 'ts');
      expect(html).toMatch(/style="[^"]*color:/);
    });

    it('highlightCode() supports tsx language', () => {
      const html = highlightCode('<Button intent="primary">Click</Button>', 'tsx');
      expect(html).not.toBeNull();
      expect(html).toContain('Button');
      expect(html).toContain('primary');
    });

    it('highlightCode() supports bash language', () => {
      const html = highlightCode('echo "hello world"', 'bash');
      expect(html).not.toBeNull();
      expect(html).toContain('echo');
    });

    it('highlightCode() supports json language', () => {
      const html = highlightCode('{ "key": "value" }', 'json');
      expect(html).not.toBeNull();
      expect(html).toContain('key');
    });

    it('highlightCode() handles empty string input', () => {
      const html = highlightCode('', 'ts');
      expect(html).not.toBeNull();
      expect(html).toContain('<pre');
    });

    it('highlightCode() handles multi-line code', () => {
      const code = `import { Button } from 'vertz/components';

<Button intent="primary">Click me</Button>`;
      const html = highlightCode(code, 'tsx');
      expect(html).not.toBeNull();
      expect(html).toContain('import');
      expect(html).toContain('Button');
      expect(html).toContain('primary');
    });

    it('highlightCode() uses github-dark theme by default', () => {
      const html = highlightCode('const x = 1;', 'ts');
      expect(html).toContain('github-dark');
    });
  });
});
