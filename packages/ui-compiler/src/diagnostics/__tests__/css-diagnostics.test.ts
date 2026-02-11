import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { CSSDiagnostics } from '../css-diagnostics';

function createSourceFile(source: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  return project.createSourceFile('test.tsx', source);
}

describe('CSSDiagnostics', () => {
  const diagnostics = new CSSDiagnostics();

  it('reports unknown property shorthand', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  card: ['zindex:10'],
});
    `.trim(),
    );

    const results = diagnostics.analyze(sourceFile);
    expect(results.some((d) => d.code === 'css-unknown-property')).toBe(true);
    expect(results.some((d) => d.message.includes('zindex'))).toBe(true);
  });

  it('reports unknown color token', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  card: ['bg:potato'],
});
    `.trim(),
    );

    const results = diagnostics.analyze(sourceFile);
    expect(results.some((d) => d.code === 'css-unknown-color-token')).toBe(true);
    expect(results.some((d) => d.message.includes('potato'))).toBe(true);
  });

  it('reports unknown color namespace', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  card: ['bg:foo.500'],
});
    `.trim(),
    );

    const results = diagnostics.analyze(sourceFile);
    expect(results.some((d) => d.code === 'css-unknown-color-token')).toBe(true);
  });

  it('reports invalid spacing (magic number)', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  card: ['p:13'],
});
    `.trim(),
    );

    const results = diagnostics.analyze(sourceFile);
    expect(results.some((d) => d.code === 'css-invalid-spacing')).toBe(true);
    expect(results.some((d) => d.message.includes('13'))).toBe(true);
  });

  it('reports malformed shorthand with too many segments', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  card: ['a:b:c:d'],
});
    `.trim(),
    );

    const results = diagnostics.analyze(sourceFile);
    expect(results.some((d) => d.code === 'css-malformed-shorthand')).toBe(true);
  });

  it('does not report valid shorthands', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  card: ['p:4', 'bg:primary', 'rounded:lg', 'flex', 'hover:bg:primary.700'],
});
    `.trim(),
    );

    const results = diagnostics.analyze(sourceFile);
    expect(results).toHaveLength(0);
  });

  it('does not report valid display keywords', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  layout: ['flex', 'grid', 'block', 'inline', 'hidden'],
});
    `.trim(),
    );

    const results = diagnostics.analyze(sourceFile);
    expect(results).toHaveLength(0);
  });

  it('includes fix suggestions in diagnostics', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  card: ['bg:potato'],
});
    `.trim(),
    );

    const results = diagnostics.analyze(sourceFile);
    const colorDiag = results.find((d) => d.code === 'css-unknown-color-token');
    expect(colorDiag?.fix).toBeDefined();
    expect(colorDiag?.fix).toContain('primary');
  });

  it('reports line and column for errors', () => {
    const sourceFile = createSourceFile(`const styles = css({
  card: ['bg:potato'],
});`);

    const results = diagnostics.analyze(sourceFile);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.line).toBeGreaterThan(0);
    expect(results[0]?.column).toBeGreaterThanOrEqual(0);
  });

  it('reports errors as error severity', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  card: ['bg:potato'],
});
    `.trim(),
    );

    const results = diagnostics.analyze(sourceFile);
    expect(results.every((d) => d.severity === 'error')).toBe(true);
  });

  it('validates pseudo prefixes', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  card: ['bogus:bg:primary'],
});
    `.trim(),
    );

    const results = diagnostics.analyze(sourceFile);
    // 'bogus' as first part of 3 segments should be flagged as unknown pseudo
    expect(results.some((d) => d.code === 'css-unknown-pseudo')).toBe(true);
  });

  it('ignores non-css() calls', () => {
    const sourceFile = createSourceFile(
      `
const styles = something({
  card: ['bg:potato'],
});
    `.trim(),
    );

    const results = diagnostics.analyze(sourceFile);
    expect(results).toHaveLength(0);
  });

  it('accepts valid CSS keywords for colors', () => {
    const sourceFile = createSourceFile(
      `
const styles = css({
  card: ['bg:transparent', 'text:inherit'],
});
    `.trim(),
    );

    const results = diagnostics.analyze(sourceFile);
    expect(results).toHaveLength(0);
  });
});
