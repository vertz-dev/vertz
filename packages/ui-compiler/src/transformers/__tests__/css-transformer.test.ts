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
});
