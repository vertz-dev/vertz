/**
 * CSS Diagnostics -- Detect invalid tokens, magic numbers, and
 * other CSS-related issues in css() calls.
 *
 * Uses shared token tables from @vertz/ui/internals as the single source
 * of truth for valid properties, pseudos, spacing values, and color namespaces.
 */

import {
  COLOR_NAMESPACES,
  CSS_COLOR_KEYWORDS,
  KEYWORD_MAP,
  PROPERTY_MAP,
  PSEUDO_PREFIXES,
  SPACING_SCALE,
} from '@vertz/ui/internals';
import { type SourceFile, SyntaxKind } from 'ts-morph';
import type { CompilerDiagnostic } from '../types';

/** Known property shorthands: union of PROPERTY_MAP keys and KEYWORD_MAP keys. */
const KNOWN_PROPERTIES = new Set([...Object.keys(PROPERTY_MAP), ...Object.keys(KEYWORD_MAP)]);

/** Valid spacing scale values (derived from SPACING_SCALE keys). */
const SPACING_VALUES = new Set(Object.keys(SPACING_SCALE));

/** Properties that use the spacing scale (derived from PROPERTY_MAP entries with valueType 'spacing'). */
const SPACING_PROPERTIES = new Set(
  Object.entries(PROPERTY_MAP)
    .filter(([_, mapping]) => mapping.valueType === 'spacing')
    .map(([key]) => key),
);

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
      if (PSEUDO_PREFIXES.has(a)) {
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
    if (pseudo && !PSEUDO_PREFIXES.has(pseudo)) {
      diagnostics.push({
        code: 'css-unknown-pseudo',
        message: `Unknown pseudo prefix '${pseudo}'. Supported: ${[...PSEUDO_PREFIXES].join(', ')}`,
        severity: 'error',
        line,
        column,
        fix: `Use one of: ${[...PSEUDO_PREFIXES].join(', ')}`,
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
    if (CSS_COLOR_KEYWORDS.has(value)) return;

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
