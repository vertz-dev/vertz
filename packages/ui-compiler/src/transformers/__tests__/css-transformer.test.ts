import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { CSSAnalyzer } from '../../analyzers/css-analyzer';
import { CSSTransformer } from '../css-transformer';

function createSourceFile(source: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  return project.createSourceFile('test.tsx', source);
}

function transformCSS(source: string, filePath = 'src/components/Card.tsx') {
  const sourceFile = createSourceFile(source);
  const analyzer = new CSSAnalyzer();
  const calls = analyzer.analyze(sourceFile);
  const s = new MagicString(source);
  const transformer = new CSSTransformer();
  const result = transformer.transform(s, sourceFile, calls, filePath);
  return { code: s.toString(), css: result.css, classNameMaps: result.classNameMaps };
}

describe('CSSTransformer', () => {
  it('replaces static css() call with class names object', () => {
    const source = `const styles = css({
  card: ['p:4', 'bg:background'],
});`;
    const result = transformCSS(source);

    // The css() call should be replaced with a plain object
    expect(result.code).not.toContain('css({');
    expect(result.code).toContain('card:');
    expect(result.code).toContain("'_");
  });

  it('extracts CSS rules as separate output', () => {
    const source = `const styles = css({
  card: ['p:4', 'bg:background'],
});`;
    const result = transformCSS(source);

    expect(result.css).toContain('padding: 1rem;');
    expect(result.css).toContain('background-color: var(--color-background);');
    expect(result.css).toContain('{');
    expect(result.css).toContain('}');
  });

  it('generates deterministic class names', () => {
    const source = `const styles = css({
  card: ['p:4'],
});`;

    const result1 = transformCSS(source, 'src/Card.tsx');
    const result2 = transformCSS(source, 'src/Card.tsx');

    // Extract class name from the replacement
    const match1 = result1.code.match(/'(_[0-9a-f]{8})'/);
    const match2 = result2.code.match(/'(_[0-9a-f]{8})'/);
    expect(match1).not.toBeNull();
    expect(match1?.[1]).toBe(match2?.[1]);
  });

  it('handles pseudo-state prefixes in CSS extraction', () => {
    const source = `const styles = css({
  button: ['bg:primary', 'hover:bg:primary.700', 'focus-visible:bg:primary.800'],
});`;
    const result = transformCSS(source);

    expect(result.css).toContain(':hover');
    expect(result.css).toContain(':focus-visible');
    expect(result.css).toContain('var(--color-primary-700)');
    expect(result.css).toContain('var(--color-primary-800)');
  });

  it('handles nested object selectors', () => {
    const source = `const styles = css({
  card: ['p:4', { '&::after': ['block', 'w:full'] }],
});`;
    const result = transformCSS(source);

    expect(result.css).toContain('::after');
    expect(result.css).toContain('display: block;');
    expect(result.css).toContain('width: 100%;');
  });

  it('does not transform reactive css() calls', () => {
    const source = `const styles = css({
  card: [dynamicVar],
});`;
    const result = transformCSS(source);

    // Reactive call should remain unchanged
    expect(result.code).toContain('css({');
    expect(result.css).toBe('');
  });

  it('handles multiple css() calls', () => {
    const source = `const card = css({ root: ['p:4'] });
const button = css({ root: ['m:2'] });`;
    const result = transformCSS(source);

    expect(result.code).not.toContain('css({');
    expect(result.css).toContain('padding: 1rem;');
    expect(result.css).toContain('margin: 0.5rem;');
  });

  it('handles multiple blocks in one css() call', () => {
    const source = `const styles = css({
  card: ['p:4'],
  title: ['font:xl'],
});`;
    const result = transformCSS(source);

    expect(result.code).toContain('card:');
    expect(result.code).toContain('title:');
    expect(result.css).toContain('padding: 1rem;');
    expect(result.css).toContain('font-size: 1.25rem;');
  });

  it('resolves h:screen to height: 100vh (axis-aware)', () => {
    const source = `const styles = css({
  layout: ['h:screen'],
});`;
    const result = transformCSS(source);
    expect(result.css).toContain('height: 100vh;');
    expect(result.css).not.toContain('height: 100vw;');
  });

  it('resolves w:screen to width: 100vw', () => {
    const source = `const styles = css({
  layout: ['w:screen'],
});`;
    const result = transformCSS(source);
    expect(result.css).toContain('width: 100vw;');
  });

  it('resolves svw and dvw size keywords', () => {
    const source = `const styles = css({
  layout: ['w:svw', 'w:dvw'],
});`;
    const result = transformCSS(source);
    expect(result.css).toContain('width: 100svw;');
    expect(result.css).toContain('width: 100dvw;');
  });

  it('resolves ring shorthand to outline', () => {
    const source = `const styles = css({
  btn: ['ring:2'],
});`;
    const result = transformCSS(source);
    expect(result.css).toContain('outline');
    expect(result.css).toContain('2px');
  });

  it('resolves content shorthand', () => {
    const source = `const styles = css({
  card: ['content:empty'],
});`;
    const result = transformCSS(source);
    expect(result.css).toContain("content: '';");
  });

  it('resolves non-display keywords (relative, flex-col, uppercase, outline-none)', () => {
    const source = `const styles = css({
  panel: ['relative', 'flex-col', 'uppercase', 'outline-none'],
});`;
    const result = transformCSS(source);
    expect(result.css).toContain('position: relative;');
    expect(result.css).toContain('flex-direction: column;');
    expect(result.css).toContain('text-transform: uppercase;');
    expect(result.css).toContain('outline: none;');
  });

  it('resolves non-display keywords in nested selectors', () => {
    const source = `const styles = css({
  card: ['p:4', { '&:hover': ['relative', 'uppercase'] }],
});`;
    const result = transformCSS(source);
    expect(result.css).toContain('position: relative;');
    expect(result.css).toContain('text-transform: uppercase;');
  });

  it('handles raw declaration objects in nested selectors', () => {
    const source = `const styles = css({
  btn: ['p:4', { '&:hover': [{ property: 'background-color', value: 'color-mix(in oklch, var(--color-primary) 90%, transparent)' }] }],
});`;
    const result = transformCSS(source);
    expect(result.css).toContain('background-color: color-mix(in oklch, var(--color-primary) 90%, transparent);');
    expect(result.css).toContain(':hover');
  });

  it('mixes raw declarations with shorthands in nested selectors', () => {
    const source = `const styles = css({
  card: ['p:4', { '[data-theme="dark"] &': ['text:foreground', { property: 'background-color', value: 'rgba(0,0,0,0.3)' }] }],
});`;
    const result = transformCSS(source);
    expect(result.css).toContain('color: var(--color-foreground);');
    expect(result.css).toContain('background-color: rgba(0,0,0,0.3);');
  });

  it('replaces all & occurrences in compound selectors', () => {
    const source = `const styles = css({
  card: ['p:4', { '[data-theme="dark"] &:hover': ['bg:primary'] }],
});`;
    const result = transformCSS(source);
    const classNameMatch = result.code.match(/'(_[0-9a-f]{8})'/);
    const className = classNameMatch?.[1];
    expect(result.css).toContain(`[data-theme="dark"] .${className}:hover`);
    expect(result.css).not.toContain('&');
  });
});
