import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { CSSAnalyzer } from '../css-analyzer';

function createSourceFile(source: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  return project.createSourceFile('test.tsx', source);
}

describe('CSSAnalyzer', () => {
  const analyzer = new CSSAnalyzer();

  it('detects a static css() call with string literals', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  card: ['p:4', 'bg:background'],
  title: ['font:xl'],
});
    `.trim(),
    );

    const results = analyzer.analyze(sourceFile);
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe('static');
    expect(results[0]?.blockNames).toEqual(['card', 'title']);
  });

  it('classifies dynamic css() calls as reactive', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  card: [dynamicVar],
});
    `.trim(),
    );

    const results = analyzer.analyze(sourceFile);
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe('reactive');
  });

  it('classifies template literal values as reactive', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  card: [\`p:\${size}\`],
});
    `.trim(),
    );

    const results = analyzer.analyze(sourceFile);
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe('reactive');
  });

  it('handles static nested object syntax', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  card: ['p:4', { '&::after': ['block', 'w:full'] }],
});
    `.trim(),
    );

    const results = analyzer.analyze(sourceFile);
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe('static');
    expect(results[0]?.blockNames).toEqual(['card']);
  });

  it('classifies non-object argument as reactive', () => {
    const sourceFile = createSourceFile(
      `
const styles = css(dynamicInput);
    `.trim(),
    );

    const results = analyzer.analyze(sourceFile);
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe('reactive');
  });

  it('detects multiple css() calls', () => {
    const sourceFile = createSourceFile(
      `
const cardStyles = css({ card: ['p:4'] });
const buttonStyles = css({ root: ['bg:primary'] });
    `.trim(),
    );

    const results = analyzer.analyze(sourceFile);
    expect(results).toHaveLength(2);
    expect(results[0]?.kind).toBe('static');
    expect(results[1]?.kind).toBe('static');
  });

  it('ignores non-css function calls', () => {
    const sourceFile = createSourceFile(
      `
const result = someOtherFunction({ card: ['p:4'] });
    `.trim(),
    );

    const results = analyzer.analyze(sourceFile);
    expect(results).toHaveLength(0);
  });

  it('records position information', () => {
    const sourceFile = createSourceFile(`const styles = css({
  card: ['p:4'],
});`);

    const results = analyzer.analyze(sourceFile);
    expect(results).toHaveLength(1);
    expect(results[0]?.line).toBeGreaterThan(0);
    expect(results[0]?.start).toBeGreaterThanOrEqual(0);
    expect(results[0]?.end).toBeGreaterThan(results[0]?.start);
  });

  it('classifies spread elements as reactive', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  card: ['p:4', ...extraStyles],
});
    `.trim(),
    );

    const results = analyzer.analyze(sourceFile);
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe('reactive');
  });

  it('skips css() calls with no arguments', () => {
    const sourceFile = createSourceFile(
      `
const styles = css();
    `.trim(),
    );

    const results = analyzer.analyze(sourceFile);
    expect(results).toHaveLength(0);
  });

  it('classifies raw declaration objects in nested selectors as static', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  btn: ['p:4', { '&:hover': [{ property: 'background-color', value: 'red' }] }],
});
    `.trim(),
    );

    const results = analyzer.analyze(sourceFile);
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe('static');
  });

  it('classifies mixed raw declarations and shorthands in nested selectors as static', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  btn: ['p:4', { '&:hover': ['text:foreground', { property: 'background-color', value: 'red' }] }],
});
    `.trim(),
    );

    const results = analyzer.analyze(sourceFile);
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe('static');
  });

  it('classifies invalid raw declarations (missing value key) as reactive', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  btn: ['p:4', { '&:hover': [{ property: 'background-color' }] }],
});
    `.trim(),
    );

    const results = analyzer.analyze(sourceFile);
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe('reactive');
  });

  it('classifies raw declarations with non-string values as reactive', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  btn: ['p:4', { '&:hover': [{ property: 'color', value: someVar }] }],
});
    `.trim(),
    );

    const results = analyzer.analyze(sourceFile);
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe('reactive');
  });

  it('classifies raw declarations with extra keys as reactive', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  btn: ['p:4', { '&:hover': [{ property: 'color', value: 'red', extra: 'bad' }] }],
});
    `.trim(),
    );

    const results = analyzer.analyze(sourceFile);
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe('reactive');
  });
});
