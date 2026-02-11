/**
 * CSS Diagnostics — Detect invalid tokens, magic numbers, and
 * other CSS-related issues in css() calls.
 */

import { type SourceFile, SyntaxKind } from 'ts-morph';
import type { CompilerDiagnostic } from '../types';

/** Known property shorthands. */
const KNOWN_PROPERTIES = new Set([
  'p',
  'px',
  'py',
  'pt',
  'pr',
  'pb',
  'pl',
  'm',
  'mx',
  'my',
  'mt',
  'mr',
  'mb',
  'ml',
  'w',
  'h',
  'min-w',
  'max-w',
  'min-h',
  'max-h',
  'bg',
  'text',
  'border',
  'rounded',
  'shadow',
  'flex',
  'grid',
  'block',
  'inline',
  'hidden',
  'gap',
  'items',
  'justify',
  'font',
  'weight',
  'leading',
]);

/** Known pseudo prefixes. */
const KNOWN_PSEUDOS = new Set([
  'hover',
  'focus',
  'focus-visible',
  'active',
  'disabled',
  'first',
  'last',
]);

/** Known color token namespaces. */
const COLOR_NAMESPACES = new Set([
  'primary',
  'secondary',
  'accent',
  'background',
  'foreground',
  'muted',
  'destructive',
  'success',
  'warning',
  'info',
  'border',
  'ring',
  'input',
  'card',
  'popover',
]);

/** Valid spacing scale values. */
const SPACING_VALUES = new Set([
  '0',
  '0.5',
  '1',
  '1.5',
  '2',
  '2.5',
  '3',
  '3.5',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '14',
  '16',
  '20',
  '24',
  '28',
  '32',
  '36',
  '40',
  '44',
  '48',
  '52',
  '56',
  '60',
  '64',
  '72',
  '80',
  '96',
  'auto',
]);

/** Properties that use the spacing scale. */
const SPACING_PROPERTIES = new Set([
  'p',
  'px',
  'py',
  'pt',
  'pr',
  'pb',
  'pl',
  'm',
  'mx',
  'my',
  'mt',
  'mr',
  'mb',
  'ml',
  'gap',
]);

/**
 * Analyze css() calls for diagnostic issues.
 */
export class CSSDiagnostics {
  analyze(sourceFile: SourceFile): CompilerDiagnostic[] {
    const diagnostics: CompilerDiagnostic[] = [];

    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

    for (const call of callExpressions) {
      const expression = call.getExpression();
      if (!expression.isKind(SyntaxKind.Identifier) || expression.getText() !== 'css') {
        continue;
      }

      const args = call.getArguments();
      if (args.length === 0) continue;

      const firstArg = args[0];
      if (!firstArg || !firstArg.isKind(SyntaxKind.ObjectLiteralExpression)) continue;

      for (const prop of firstArg.getProperties()) {
        if (!prop.isKind(SyntaxKind.PropertyAssignment)) continue;

        const init = prop.getInitializer();
        if (!init || !init.isKind(SyntaxKind.ArrayLiteralExpression)) continue;

        for (const element of init.getElements()) {
          if (!element.isKind(SyntaxKind.StringLiteral)) continue;

          const value = element.getLiteralValue();
          const pos = sourceFile.getLineAndColumnAtPos(element.getStart());

          diagnostics.push(...this.validateShorthand(value, pos.line, pos.column - 1));
        }
      }
    }

    return diagnostics;
  }

  /** Validate a single shorthand string. */
  private validateShorthand(input: string, line: number, column: number): CompilerDiagnostic[] {
    const diagnostics: CompilerDiagnostic[] = [];
    const parts = input.split(':');

    if (parts.length === 0 || (parts.length === 1 && parts[0] === '')) {
      diagnostics.push({
        code: 'css-empty-shorthand',
        message: 'Empty shorthand string',
        severity: 'error',
        line,
        column,
      });
      return diagnostics;
    }

    let property: string;
    let value: string | undefined;
    let pseudo: string | undefined;

    if (parts.length === 1) {
      const [p] = parts as [string];
      property = p;
    } else if (parts.length === 2) {
      const [a, b] = parts as [string, string];
      if (KNOWN_PSEUDOS.has(a)) {
        pseudo = a;
        property = b;
      } else {
        property = a;
        value = b;
      }
    } else if (parts.length === 3) {
      const [a, b, c] = parts as [string, string, string];
      pseudo = a;
      property = b;
      value = c;
    } else {
      diagnostics.push({
        code: 'css-malformed-shorthand',
        message: `Malformed shorthand '${input}': too many segments. Expected 'property:value' or 'pseudo:property:value'.`,
        severity: 'error',
        line,
        column,
      });
      return diagnostics;
    }

    // Validate pseudo
    if (pseudo && !KNOWN_PSEUDOS.has(pseudo)) {
      diagnostics.push({
        code: 'css-unknown-pseudo',
        message: `Unknown pseudo prefix '${pseudo}'. Supported: ${[...KNOWN_PSEUDOS].join(', ')}`,
        severity: 'error',
        line,
        column,
        fix: `Use one of: ${[...KNOWN_PSEUDOS].join(', ')}`,
      });
    }

    // Validate property
    if (!KNOWN_PROPERTIES.has(property)) {
      diagnostics.push({
        code: 'css-unknown-property',
        message: `Unknown CSS shorthand property '${property}'.`,
        severity: 'error',
        line,
        column,
        fix: `Available properties: ${[...KNOWN_PROPERTIES].join(', ')}`,
      });
    }

    // Validate value for spacing properties (detect magic numbers)
    if (value && SPACING_PROPERTIES.has(property) && !SPACING_VALUES.has(value)) {
      diagnostics.push({
        code: 'css-invalid-spacing',
        message: `Invalid spacing value '${value}' for '${property}'. Use the spacing scale (0, 1, 2, 4, 8, etc.).`,
        severity: 'error',
        line,
        column,
        fix: `Use a spacing scale value: ${[...SPACING_VALUES].join(', ')}`,
      });
    }

    // Validate color tokens
    if (value && (property === 'bg' || property === 'text' || property === 'border')) {
      this.validateColorToken(value, property, line, column, diagnostics);
    }

    return diagnostics;
  }

  /** Validate a color token value. */
  private validateColorToken(
    value: string,
    property: string,
    line: number,
    column: number,
    diagnostics: CompilerDiagnostic[],
  ): void {
    const cssKeywords = new Set(['transparent', 'inherit', 'currentColor', 'initial', 'unset']);
    if (cssKeywords.has(value)) return;

    const dotIndex = value.indexOf('.');
    if (dotIndex !== -1) {
      const namespace = value.substring(0, dotIndex);
      if (!COLOR_NAMESPACES.has(namespace)) {
        diagnostics.push({
          code: 'css-unknown-color-token',
          message: `Unknown color token namespace '${namespace}' in '${property}:${value}'. Known: ${[...COLOR_NAMESPACES].join(', ')}`,
          severity: 'error',
          line,
          column,
          fix: `Use a known color namespace: ${[...COLOR_NAMESPACES].join(', ')}`,
        });
      }
      return;
    }

    if (!COLOR_NAMESPACES.has(value)) {
      diagnostics.push({
        code: 'css-unknown-color-token',
        message: `Unknown color token '${value}' for '${property}'. Use a design token (e.g. 'primary', 'background') or shade notation (e.g. 'primary.700').`,
        severity: 'error',
        line,
        column,
        fix: `Use a known color token: ${[...COLOR_NAMESPACES].join(', ')}`,
      });
    }
  }
}
