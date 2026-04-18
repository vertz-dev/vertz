import { describe, expect, it } from '@vertz/test';
import { rewriteSource } from './rewriter';

function run(input: string): string {
  return rewriteSource(input, 'test.tsx').code;
}

describe('rewriteSource — css() calls', () => {
  it('rewrites a single array-form block inside css()', () => {
    const input = [
      "import { css } from '@vertz/ui';",
      '',
      "const styles = css({ panel: ['p:4', 'bg:primary'] });",
      '',
    ].join('\n');

    const output = run(input);
    expect(output).toContain(
      'const styles = css({ panel: { padding: token.spacing[4], backgroundColor: token.color.primary } });',
    );
  });

  it('leaves object-form blocks untouched (idempotent)', () => {
    const input = [
      "import { css, token } from '@vertz/ui';",
      '',
      'const styles = css({ panel: { padding: token.spacing[4] } });',
      '',
    ].join('\n');

    const output = run(input);
    expect(output).toBe(input);
    expect(rewriteSource(output, 'test.tsx').changed).toBe(false);
  });

  it('rewrites multiple block keys in one css() call', () => {
    const input = [
      "import { css } from '@vertz/ui';",
      '',
      "const styles = css({ panel: ['p:4'], title: ['font:xl'] });",
    ].join('\n');

    const output = run(input);
    expect(output).toContain(
      'const styles = css({ panel: { padding: token.spacing[4] }, title: { fontSize: token.font.size.xl } });',
    );
  });

  it('expands pseudo groups', () => {
    const input = [
      "import { css } from '@vertz/ui';",
      '',
      "const styles = css({ button: ['p:4', 'hover:bg:primary.500'] });",
    ].join('\n');

    const output = run(input);
    expect(output).toContain(
      "const styles = css({ button: { padding: token.spacing[4], '&:hover': { backgroundColor: token.color.primary[500] } } });",
    );
  });
});

describe('rewriteSource — variants() calls', () => {
  it('rewrites base and per-variant option arrays', () => {
    const input = [
      "import { variants } from '@vertz/ui';",
      '',
      'const button = variants({',
      "  base: ['inline-flex', 'rounded:md'],",
      '  variants: {',
      '    intent: {',
      "      primary: ['bg:primary', 'text:white'],",
      "      ghost: ['bg:transparent'],",
      '    },',
      '  },',
      '});',
    ].join('\n');

    const output = run(input);
    expect(output).toContain("base: { display: 'inline-flex', borderRadius: token.radius.md }");
    expect(output).toContain("primary: { backgroundColor: token.color.primary, color: 'white' }");
    expect(output).toContain("ghost: { backgroundColor: 'transparent' }");
  });

  it('rewrites compoundVariants.styles arrays', () => {
    const input = [
      "import { variants } from '@vertz/ui';",
      '',
      'const button = variants({',
      "  base: ['flex'],",
      '  variants: { intent: { primary: {} } },',
      '  compoundVariants: [',
      "    { intent: 'primary', styles: ['p:4', 'font:bold'] },",
      '  ],',
      '});',
    ].join('\n');

    const output = run(input);
    expect(output).toContain(
      'styles: { padding: token.spacing[4], fontWeight: token.font.weight.bold }',
    );
  });
});

describe('rewriteSource — import management', () => {
  it('adds token to an existing @vertz/ui named import', () => {
    const input = [
      "import { css } from '@vertz/ui';",
      '',
      "const styles = css({ panel: ['p:4'] });",
    ].join('\n');

    const output = run(input);
    expect(output).toMatch(/^import \{ css, token \} from '@vertz\/ui';/);
  });

  it('preserves existing token import (no duplicate)', () => {
    const input = [
      "import { css, token } from '@vertz/ui';",
      '',
      "const styles = css({ panel: ['p:4'] });",
    ].join('\n');

    const output = run(input);
    const tokenOccurrences = output.match(/\btoken\b/g)?.length ?? 0;
    // token appears once in import + once in generated value = 2
    expect(tokenOccurrences).toBe(2);
  });

  it('adds a new import statement when file does not import from @vertz/ui', () => {
    const input = [
      "import { css } from '@vertz/ui/css';",
      '',
      "const styles = css({ panel: ['p:4'] });",
    ].join('\n');

    const output = run(input);
    expect(output).toContain("import { token } from '@vertz/ui';");
  });

  it('does not add token import when no token reference is generated', () => {
    const input = [
      "import { css } from '@vertz/ui';",
      '',
      "const styles = css({ panel: ['flex', 'bg:white'] });",
    ].join('\n');

    const output = run(input);
    expect(output).not.toContain('token');
  });

  it('adds a new token import when existing @vertz/ui import is type-only', () => {
    const input = [
      "import type { CSSProps } from '@vertz/ui';",
      "import { css } from '@vertz/ui/css';",
      '',
      "const styles = css({ panel: ['p:4'] });",
    ].join('\n');

    const output = run(input);
    expect(output).toContain("import { token } from '@vertz/ui';");
  });

  it('throws when @vertz/ui imports token under an alias', () => {
    const input = [
      "import { css, token as tk } from '@vertz/ui';",
      '',
      "const styles = css({ panel: ['p:4'] });",
    ].join('\n');

    expect(() => rewriteSource(input, 'test.tsx')).toThrow(/token.*aliased.*tk/);
  });
});

describe('rewriteSource — changed flag', () => {
  it('sets changed=true when at least one rewrite occurs', () => {
    const result = rewriteSource(
      "import { css } from '@vertz/ui';\nconst s = css({ p: ['p:4'] });\n",
      'test.tsx',
    );
    expect(result.changed).toBe(true);
  });

  it('sets changed=false for already-migrated files', () => {
    const result = rewriteSource(
      "import { css, token } from '@vertz/ui';\nconst s = css({ p: { padding: token.spacing[4] } });\n",
      'test.tsx',
    );
    expect(result.changed).toBe(false);
  });
});

describe('rewriteSource — mixed arrays (strings + object literals)', () => {
  it('rewrites a mixed array with trailing nested selector object', () => {
    const input = [
      "import { css } from '@vertz/ui';",
      '',
      "const styles = css({ alertDescription: ['text:muted-foreground', 'text:sm', { '&': { 'line-height': '1.625' } }] });",
    ].join('\n');

    const output = run(input);
    expect(output).toContain(
      "alertDescription: { color: token.color['muted-foreground'], fontSize: token.font.size.sm, '&': { lineHeight: '1.625' } }",
    );
  });

  it('converts nested shorthand arrays inside selector values', () => {
    const input = [
      "import { css } from '@vertz/ui';",
      '',
      "const styles = css({ card: ['p:4', { '&:hover': ['bg:primary', 'text:white'] }] });",
    ].join('\n');

    const output = run(input);
    expect(output).toContain(
      "card: { padding: token.spacing[4], '&:hover': { backgroundColor: token.color.primary, color: 'white' } }",
    );
  });

  it('preserves unquoted CSS property keys in camelCase', () => {
    const input = [
      "import { css } from '@vertz/ui';",
      '',
      "const styles = css({ root: ['p:4', { '&': { padding: '0', margin: '0' } }] });",
    ].join('\n');

    const output = run(input);
    expect(output).toContain(
      "root: { padding: token.spacing[4], '&': { padding: '0', margin: '0' } }",
    );
  });
});

describe('rewriteSource — mixed arrays with spreadable expressions', () => {
  it('emits ...spread for identifier references alongside shorthands', () => {
    const input = [
      "import { css } from '@vertz/ui';",
      '',
      "const focusRing = { '&:focus-visible': { outline: 'none' } };",
      "const styles = css({ root: ['p:4', focusRing] });",
    ].join('\n');

    const output = run(input);
    expect(output).toContain('root: { padding: token.spacing[4], ...focusRing }');
  });

  it('emits ...spread for call expressions alongside shorthands', () => {
    const input = [
      "import { css } from '@vertz/ui';",
      '',
      "const styles = css({ root: ['p:4', bgOpacity('input', 30)] });",
    ].join('\n');

    const output = run(input);
    expect(output).toContain("root: { padding: token.spacing[4], ...bgOpacity('input', 30) }");
  });

  it('emits ...spread for computed-key objects referenced as identifiers', () => {
    const input = [
      "import { css } from '@vertz/ui';",
      '',
      "const dark = { [DARK]: ['bg:primary'] };",
      "const styles = css({ root: ['p:4', dark] });",
    ].join('\n');

    const output = run(input);
    expect(output).toContain('root: { padding: token.spacing[4], ...dark }');
  });
});

describe('rewriteSource — SpreadElement in mixed arrays', () => {
  it('preserves explicit spread syntax alongside shorthands', () => {
    const input = [
      "import { css } from '@vertz/ui';",
      '',
      "const base = { padding: token.spacing[2] };",
      "const styles = css({ root: [...base, 'h:4'] });",
    ].join('\n');

    const output = run(input);
    expect(output).toContain('root: { height: token.spacing[4], ...base }');
  });
});

describe('rewriteSource — single-element wrapper arrays', () => {
  it('unwraps a selector value of [callExpression] to just the call', () => {
    const input = [
      "import { css } from '@vertz/ui';",
      '',
      "const styles = css({ root: { padding: token.spacing[4], '&[data-state]': [animationDecl('x')] } });",
    ].join('\n');

    const output = run(input);
    expect(output).toContain("'&[data-state]': animationDecl('x')");
  });

  it('unwraps a selector value of [{ ...objLiteral }] to just the object', () => {
    const input = [
      "import { css } from '@vertz/ui';",
      '',
      "const styles = css({ root: { padding: token.spacing[4], '&:hover': [{ color: 'red' }] } });",
    ].join('\n');

    const output = run(input);
    expect(output).toContain("'&:hover': { color: 'red' }");
  });
});

describe('rewriteSource — errors', () => {
  it('throws when an unknown shorthand is encountered', () => {
    const input = "const s = css({ p: ['bogus:whatever'] });";
    expect(() => rewriteSource(input, 'test.tsx')).toThrow(/bogus:whatever/);
  });
});
