import { describe, expect, it } from 'bun:test';
import { escapeHtml, fileExtension, isMarkdown } from './artifact-viewer-utils';

describe('fileExtension()', () => {
  it('returns extension for dotted paths', () => {
    expect(fileExtension('plans/feature.md')).toBe('md');
    expect(fileExtension('src/index.ts')).toBe('ts');
  });

  it('returns empty string for paths without extension', () => {
    expect(fileExtension('Makefile')).toBe('');
    expect(fileExtension('src/README')).toBe('');
  });
});

describe('isMarkdown()', () => {
  it('returns true for .md files', () => {
    expect(isMarkdown('plans/feature.md')).toBe(true);
  });

  it('returns true for .mdx files', () => {
    expect(isMarkdown('docs/page.mdx')).toBe(true);
  });

  it('returns false for non-markdown files', () => {
    expect(isMarkdown('src/index.ts')).toBe(false);
    expect(isMarkdown('README')).toBe(false);
  });
});

describe('escapeHtml()', () => {
  it('escapes angle brackets', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('passes through safe text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});
